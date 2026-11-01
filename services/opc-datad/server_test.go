package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"testing"
)

func TestRejectsNonLoopback(t *testing.T) {
	if err := CheckBind("0.0.0.0:3475"); err == nil {
		t.Fatal("0.0.0.0 必须被拒绝")
	}
	if err := CheckBind("10.1.2.3:3475"); err == nil {
		t.Fatal("局域网地址必须被拒绝")
	}
	if err := CheckBind("127.0.0.1:3475"); err != nil {
		t.Fatal(err)
	}
}

func TestOTLPAndIngestRoundTrip(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "datad.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	server, err := Start(db, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Close() })

	base := "http://" + server.Addr
	client := &http.Client{}

	trace := []byte(`{
	  "resourceSpans": [{
	    "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "magpie"}}]},
	    "scopeSpans": [{
	      "spans": [{
	        "name": "chat",
	        "attributes": [
	          {"key": "opc.person", "value": {"stringValue": "me"}},
	          {"key": "opc.project", "value": {"stringValue": "opc"}},
	          {"key": "opc.role", "value": {"stringValue": "owner"}},
	          {"key": "opc.module", "value": {"stringValue": "m3-gateway"}},
	          {"key": "langfuse.observation.cost_details", "value": {"stringValue": "{\"input\":0.1,\"output\":0.2,\"total\":0.3}"}}
	        ]
	      }]
	    }]
	  }]
	}`)
	post(t, client, base+"/v1/traces", trace, map[string]string{
		"Content-Type": "application/json",
		"X-Opc-Person": "header-person",
	})

	ingest := []byte(`{"name":"opc.gateway.snapshot","costUsd":1.25}`)
	post(t, client, base+"/v1/ingest", ingest, map[string]string{
		"Content-Type":  "application/json",
		"X-Opc-Person":  "me",
		"X-Opc-Project": "opc",
		"X-Opc-Role":    "owner",
		"X-Opc-Module":  "m3-gateway",
	})

	response, err := client.Get(base + "/v1/records?limit=10")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("读出状态 %d", response.StatusCode)
	}
	var page struct {
		Records []struct {
			Kind    string   `json:"kind"`
			Name    string   `json:"name"`
			Person  string   `json:"person"`
			Project string   `json:"project"`
			Role    string   `json:"role"`
			Module  string   `json:"module"`
			CostUSD *float64 `json:"costUsd"`
		} `json:"records"`
	}
	if err := json.NewDecoder(response.Body).Decode(&page); err != nil {
		t.Fatal(err)
	}
	if len(page.Records) != 2 {
		t.Fatalf("记录数 %d", len(page.Records))
	}
	span := page.Records[0]
	if span.Kind != "span" || span.Name != "chat" || span.Person != "me" || span.Module != "m3-gateway" {
		t.Fatalf("OTLP 记录不对：%+v", span)
	}
	if span.CostUSD == nil || *span.CostUSD != 0.3 {
		t.Fatalf("OTLP 花费不对：%v", span.CostUSD)
	}
	row := page.Records[1]
	if row.Kind != "ingest" || row.Name != "opc.gateway.snapshot" || row.Person != "me" || row.Project != "opc" {
		t.Fatalf("等价写入不对：%+v", row)
	}
	if row.CostUSD == nil || *row.CostUSD != 1.25 {
		t.Fatalf("等价写入花费不对：%v", row.CostUSD)
	}
}

func post(t *testing.T, client *http.Client, url string, body []byte, headers map[string]string) {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("%s 状态 %d：%s", url, response.StatusCode, payload)
	}
}
