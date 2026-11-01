// opc-datad 是本机数据仓：收 OTLP JSON 或一条等价写入，再按 HTTP 读出来。
// 只绑 127.0.0.1 / localhost / ::1。不采集父亲视频，也不转发到别的机器。
package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const maxBody = 2 << 20

type Tags struct {
	Person  string
	Project string
	Role    string
	Module  string
}

type Record struct {
	ID         int64    `json:"id"`
	ReceivedAt string   `json:"receivedAt"`
	Kind       string   `json:"kind"`
	Name       string   `json:"name"`
	Person     string   `json:"person"`
	Project    string   `json:"project"`
	Role       string   `json:"role"`
	Module     string   `json:"module"`
	CostUSD    *float64 `json:"costUsd"`
}

func CheckBind(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("opc-datad 地址不合法：%s", addr)
	}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" {
		return fmt.Errorf("opc-datad 只绑本机，拒绝 %s", addr)
	}
	return nil
}

func OpenDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		received_at TEXT NOT NULL,
		kind TEXT NOT NULL,
		name TEXT NOT NULL,
		person TEXT NOT NULL DEFAULT '',
		project TEXT NOT NULL DEFAULT '',
		role TEXT NOT NULL DEFAULT '',
		module TEXT NOT NULL DEFAULT '',
		cost_usd REAL,
		body TEXT NOT NULL
	)`)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func Start(db *sql.DB, addr string) (*http.Server, error) {
	if err := CheckBind(addr); err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	server := &http.Server{Handler: routes(db)}
	server.Addr = listener.Addr().String()
	go func() { _ = server.Serve(listener) }()
	return server, nil
}

func routes(db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("GET /v1/records", func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil || parsed < 1 {
				http.Error(w, "limit 不合法", http.StatusBadRequest)
				return
			}
			if parsed > 200 {
				parsed = 200
			}
			limit = parsed
		}
		records, err := listRecords(db, limit)
		if err != nil {
			http.Error(w, "读不出来", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"records": records})
	})
	mux.HandleFunc("POST /v1/traces", func(w http.ResponseWriter, r *http.Request) {
		acceptSignal(w, r, db, "traces")
	})
	mux.HandleFunc("POST /v1/metrics", func(w http.ResponseWriter, r *http.Request) {
		acceptSignal(w, r, db, "metrics")
	})
	mux.HandleFunc("POST /v1/ingest", func(w http.ResponseWriter, r *http.Request) {
		body, tags, err := readBody(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var doc map[string]any
		if err := json.Unmarshal(body, &doc); err != nil {
			http.Error(w, "不是 JSON", http.StatusBadRequest)
			return
		}
		name, _ := doc["name"].(string)
		if strings.TrimSpace(name) == "" {
			name = "opc.ingest"
		}
		tags = fillTags(tagsFromMap(doc["attributes"]), tags)
		if err := insertRecord(db, "ingest", name, tags, floatPtr(doc["costUsd"]), string(body)); err != nil {
			http.Error(w, "写不进去", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !loopbackRemote(r.RemoteAddr) {
			http.Error(w, "只接受本机", http.StatusForbidden)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func acceptSignal(w http.ResponseWriter, r *http.Request, db *sql.DB, signal string) {
	body, header, err := readBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var doc map[string]any
	if err := json.Unmarshal(body, &doc); err != nil {
		http.Error(w, "不是 JSON", http.StatusBadRequest)
		return
	}
	var records []stored
	if signal == "traces" {
		records = spansOf(doc, header)
	} else {
		records = metricsOf(doc, header)
	}
	if len(records) == 0 {
		records = []stored{{kind: signal, name: "otlp." + signal, tags: header, body: string(body)}}
	}
	for _, record := range records {
		if err := insertRecord(db, record.kind, record.name, record.tags, record.cost, record.body); err != nil {
			http.Error(w, "写不进去", http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{})
}

type stored struct {
	kind string
	name string
	tags Tags
	cost *float64
	body string
}

func spansOf(doc map[string]any, header Tags) []stored {
	var out []stored
	for _, resource := range asArray(doc["resourceSpans"]) {
		res := asMap(resource)
		base := fillTags(tagsFromAttributes(asArray(asMap(res["resource"])["attributes"])), header)
		for _, scope := range asArray(res["scopeSpans"]) {
			for _, span := range asArray(asMap(scope)["spans"]) {
				sp := asMap(span)
				attrs := asArray(sp["attributes"])
				name, _ := sp["name"].(string)
				if name == "" {
					name = "span"
				}
				raw, _ := json.Marshal(sp)
				out = append(out, stored{
					kind: "span",
					name: name,
					tags: fillTags(tagsFromAttributes(attrs), base),
					cost: costFromAttributes(attrs),
					body: string(raw),
				})
			}
		}
	}
	return out
}

func metricsOf(doc map[string]any, header Tags) []stored {
	var out []stored
	for _, resource := range asArray(doc["resourceMetrics"]) {
		res := asMap(resource)
		base := fillTags(tagsFromAttributes(asArray(asMap(res["resource"])["attributes"])), header)
		for _, scope := range asArray(res["scopeMetrics"]) {
			for _, metric := range asArray(asMap(scope)["metrics"]) {
				item := asMap(metric)
				name, _ := item["name"].(string)
				if name == "" {
					name = "metric"
				}
				raw, _ := json.Marshal(item)
				out = append(out, stored{kind: "metric", name: name, tags: base, body: string(raw)})
			}
		}
	}
	return out
}

func readBody(r *http.Request) ([]byte, Tags, error) {
	if r.Body == nil {
		return nil, Tags{}, errors.New("没有正文")
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil {
		return nil, Tags{}, err
	}
	if len(body) == 0 || len(body) > maxBody {
		return nil, Tags{}, errors.New("正文为空或太大")
	}
	return body, Tags{
		Person:  strings.TrimSpace(r.Header.Get("X-Opc-Person")),
		Project: strings.TrimSpace(r.Header.Get("X-Opc-Project")),
		Role:    strings.TrimSpace(r.Header.Get("X-Opc-Role")),
		Module:  strings.TrimSpace(r.Header.Get("X-Opc-Module")),
	}, nil
}

func tagsFromAttributes(attrs []any) Tags {
	var tags Tags
	for _, attr := range attrs {
		item := asMap(attr)
		key, _ := item["key"].(string)
		value := attrString(asMap(item["value"]))
		switch key {
		case "opc.person":
			tags.Person = value
		case "opc.project":
			tags.Project = value
		case "opc.role":
			tags.Role = value
		case "opc.module":
			tags.Module = value
		}
	}
	return tags
}

func tagsFromMap(value any) Tags {
	record := asMap(value)
	return Tags{
		Person:  stringOf(record["opc.person"]),
		Project: stringOf(record["opc.project"]),
		Role:    stringOf(record["opc.role"]),
		Module:  stringOf(record["opc.module"]),
	}
}

func fillTags(primary, fallback Tags) Tags {
	if primary.Person == "" {
		primary.Person = fallback.Person
	}
	if primary.Project == "" {
		primary.Project = fallback.Project
	}
	if primary.Role == "" {
		primary.Role = fallback.Role
	}
	if primary.Module == "" {
		primary.Module = fallback.Module
	}
	return primary
}

func costFromAttributes(attrs []any) *float64 {
	for _, attr := range attrs {
		item := asMap(attr)
		key, _ := item["key"].(string)
		if key != "langfuse.observation.cost_details" {
			continue
		}
		raw := attrString(asMap(item["value"]))
		var details map[string]any
		if json.Unmarshal([]byte(raw), &details) != nil {
			return nil
		}
		return floatPtr(details["total"])
	}
	return nil
}

func attrString(value map[string]any) string {
	if text, ok := value["stringValue"].(string); ok {
		return text
	}
	if text, ok := value["intValue"].(string); ok {
		return text
	}
	return ""
}

func insertRecord(db *sql.DB, kind, name string, tags Tags, cost *float64, body string) error {
	var costValue any
	if cost != nil {
		costValue = *cost
	}
	_, err := db.Exec(
		`INSERT INTO records (received_at, kind, name, person, project, role, module, cost_usd, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		time.Now().UTC().Format(time.RFC3339Nano), kind, name, tags.Person, tags.Project, tags.Role, tags.Module, costValue, body,
	)
	return err
}

func listRecords(db *sql.DB, limit int) ([]Record, error) {
	rows, err := db.Query(`SELECT id, received_at, kind, name, person, project, role, module, cost_usd FROM records ORDER BY id ASC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	for rows.Next() {
		var record Record
		var cost sql.NullFloat64
		if err := rows.Scan(&record.ID, &record.ReceivedAt, &record.Kind, &record.Name, &record.Person, &record.Project, &record.Role, &record.Module, &cost); err != nil {
			return nil, err
		}
		if cost.Valid {
			value := cost.Float64
			record.CostUSD = &value
		}
		out = append(out, record)
	}
	return out, rows.Err()
}

func loopbackRemote(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}

func asArray(value any) []any {
	items, _ := value.([]any)
	return items
}

func asMap(value any) map[string]any {
	record, _ := value.(map[string]any)
	if record == nil {
		return map[string]any{}
	}
	return record
}

func stringOf(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func floatPtr(value any) *float64 {
	switch typed := value.(type) {
	case float64:
		return &typed
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
