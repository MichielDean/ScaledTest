package db

import (
	"io/fs"
	"strings"
	"testing"
)

func TestMigrationsEmbedded(t *testing.T) {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		t.Fatalf("failed to read embedded migrations: %v", err)
	}

	if len(entries) == 0 {
		t.Fatal("no migration files embedded")
	}

	// Count up/down pairs
	ups := 0
	downs := 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			ups++
		}
		if strings.HasSuffix(e.Name(), ".down.sql") {
			downs++
		}
	}

	if ups != downs {
		t.Errorf("migration up/down mismatch: %d up, %d down", ups, downs)
	}

	if ups != 15 {
		t.Errorf("expected 15 migration pairs, got %d", ups)
	}

	// Verify each up has a matching down
	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, ".up.sql") {
			downName := strings.Replace(name, ".up.sql", ".down.sql", 1)
			found := false
			for _, d := range entries {
				if d.Name() == downName {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("missing down migration for %s", name)
			}
		}
	}
}

func TestMigrationFilesNotEmpty(t *testing.T) {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		t.Fatalf("failed to read embedded migrations: %v", err)
	}

	for _, e := range entries {
		data, err := fs.ReadFile(migrationsFS, "migrations/"+e.Name())
		if err != nil {
			t.Errorf("failed to read %s: %v", e.Name(), err)
			continue
		}
		if len(strings.TrimSpace(string(data))) == 0 {
			t.Errorf("migration file %s is empty", e.Name())
		}
	}
}
