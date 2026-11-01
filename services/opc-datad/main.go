package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	addr := os.Getenv("OPC_DATAD_ADDR")
	if addr == "" {
		addr = "127.0.0.1:3475"
	}
	path := os.Getenv("OPC_DATAD_DB")
	if path == "" {
		path = "opc-datad.sqlite"
	}
	if err := CheckBind(addr); err != nil {
		log.Fatal(err)
	}
	db, err := OpenDB(path)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	server, err := Start(db, addr)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("opc-datad 听在 http://%s ，只接受本机", server.Addr)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	_ = server.Close()
}
