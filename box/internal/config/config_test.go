package config

import (
	"strings"
	"testing"
)

func TestParseDefaults(t *testing.T) {
	got, err := Parse(nil, "amd64")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := Config{HAL: HALSim, DataDir: "./.data", Addr: ":8443"}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	arm, err := Parse(nil, "arm64")
	if err != nil {
		t.Fatalf("Parse arm64: %v", err)
	}
	if arm.HAL != HALPi {
		t.Fatalf("arm64 default HAL = %q, want %q", arm.HAL, HALPi)
	}
}

func TestParseFlags(t *testing.T) {
	got, err := Parse([]string{"--hal=pi", "--data=/tmp/a b", "--addr=127.0.0.1:9000"}, "amd64")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := Config{HAL: HALPi, DataDir: "/tmp/a b", Addr: "127.0.0.1:9000"}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestParseRejectsUnknownHAL(t *testing.T) {
	_, err := Parse([]string{"--hal=gpio"}, "amd64")
	if err == nil {
		t.Fatal("expected an error for --hal=gpio")
	}
	for _, s := range []string{"sim", "pi"} {
		if !strings.Contains(err.Error(), s) {
			t.Errorf("error %q does not mention %q", err, s)
		}
	}
}

func TestParseRejectsEmptyData(t *testing.T) {
	if _, err := Parse([]string{"--data="}, "amd64"); err == nil {
		t.Fatal("expected an error for empty --data")
	}
}
