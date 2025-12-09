package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/olekukonko/tablewriter"
	"github.com/spf13/viper"
)

// Writer handles output formatting based on configuration.
type Writer struct {
	out    io.Writer
	err    io.Writer
	isJSON bool
}

// New creates a new output writer.
func New() *Writer {
	return &Writer{
		out:    os.Stdout,
		err:    os.Stderr,
		isJSON: viper.GetString("output") == "json",
	}
}

// IsJSON returns true if JSON output is configured.
func (w *Writer) IsJSON() bool {
	return w.isJSON
}

// JSON writes data as JSON to stdout.
func (w *Writer) JSON(data interface{}) error {
	encoder := json.NewEncoder(w.out)
	encoder.SetIndent("", "  ")
	return encoder.Encode(data)
}

// Success prints a success message.
func (w *Writer) Success(format string, args ...interface{}) {
	if w.isJSON {
		return // JSON output handles its own success messages
	}
	green := color.New(color.FgGreen).SprintFunc()
	fmt.Fprintf(w.out, "%s %s\n", green("✓"), fmt.Sprintf(format, args...))
}

// Error prints an error message.
func (w *Writer) Error(format string, args ...interface{}) {
	if w.isJSON {
		w.JSON(map[string]interface{}{
			"error": fmt.Sprintf(format, args...),
		})
		return
	}
	red := color.New(color.FgRed).SprintFunc()
	fmt.Fprintf(w.err, "%s %s\n", red("✗"), fmt.Sprintf(format, args...))
}

// Warning prints a warning message.
func (w *Writer) Warning(format string, args ...interface{}) {
	if w.isJSON {
		return
	}
	yellow := color.New(color.FgYellow).SprintFunc()
	fmt.Fprintf(w.out, "%s %s\n", yellow("!"), fmt.Sprintf(format, args...))
}

// Info prints an informational message.
func (w *Writer) Info(format string, args ...interface{}) {
	if w.isJSON {
		return
	}
	fmt.Fprintf(w.out, "%s\n", fmt.Sprintf(format, args...))
}

// Detail prints a detail line (indented).
func (w *Writer) Detail(key, value string) {
	if w.isJSON {
		return
	}
	fmt.Fprintf(w.out, "  %s: %s\n", key, value)
}

// Table creates a new table writer for tabular output.
func (w *Writer) Table(headers []string) *TableWriter {
	return &TableWriter{
		writer:   w,
		headers:  headers,
		rows:     [][]string{},
		jsonRows: []map[string]interface{}{},
	}
}

// TableWriter handles table output in both text and JSON formats.
type TableWriter struct {
	writer   *Writer
	headers  []string
	rows     [][]string
	jsonRows []map[string]interface{}
}

// AddRow adds a row to the table.
func (t *TableWriter) AddRow(values ...string) {
	t.rows = append(t.rows, values)
}

// AddRowWithData adds a row with associated JSON data.
func (t *TableWriter) AddRowWithData(data map[string]interface{}, values ...string) {
	t.rows = append(t.rows, values)
	t.jsonRows = append(t.jsonRows, data)
}

// Render outputs the table in the configured format.
func (t *TableWriter) Render() {
	if t.writer.isJSON {
		if len(t.jsonRows) > 0 {
			t.writer.JSON(t.jsonRows)
		} else {
			// Convert rows to maps using headers as keys
			result := make([]map[string]string, 0, len(t.rows))
			for _, row := range t.rows {
				rowMap := make(map[string]string)
				for i, header := range t.headers {
					if i < len(row) {
						rowMap[strings.ToLower(strings.ReplaceAll(header, " ", "_"))] = row[i]
					}
				}
				result = append(result, rowMap)
			}
			t.writer.JSON(result)
		}
		return
	}

	// Text table output
	table := tablewriter.NewWriter(t.writer.out)
	table.SetHeader(t.headers)
	table.SetBorder(false)
	table.SetHeaderAlignment(tablewriter.ALIGN_LEFT)
	table.SetAlignment(tablewriter.ALIGN_LEFT)
	table.SetCenterSeparator("")
	table.SetColumnSeparator("")
	table.SetRowSeparator("")
	table.SetHeaderLine(false)
	table.SetTablePadding("  ")
	table.SetNoWhiteSpace(true)
	table.AppendBulk(t.rows)
	table.Render()
}

// StatusColor returns a colorized status string.
func StatusColor(status string) string {
	switch strings.ToLower(status) {
	case "succeeded", "success", "passed", "active", "ready", "healthy":
		return color.GreenString(status)
	case "failed", "error", "unhealthy":
		return color.RedString(status)
	case "running", "pending", "in_progress", "discovering":
		return color.YellowString(status)
	case "cancelled", "skipped":
		return color.HiBlackString(status)
	default:
		return status
	}
}

// Spinner provides a simple progress indicator.
type Spinner struct {
	message string
	active  bool
}

// NewSpinner creates a new spinner with a message.
func NewSpinner(message string) *Spinner {
	return &Spinner{message: message}
}

// Start begins the spinner animation.
func (s *Spinner) Start() {
	if viper.GetString("output") == "json" {
		return
	}
	s.active = true
	fmt.Printf("%s...", s.message)
}

// Stop ends the spinner and prints the result.
func (s *Spinner) Stop(success bool) {
	if viper.GetString("output") == "json" {
		return
	}
	if s.active {
		if success {
			fmt.Printf(" %s\n", color.GreenString("done"))
		} else {
			fmt.Printf(" %s\n", color.RedString("failed"))
		}
	}
	s.active = false
}
