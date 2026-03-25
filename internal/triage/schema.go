package triage

// llmOutput is the JSON structure the LLM must return in response to the
// triage prompt. The prompt instructs the model to emit exactly this schema.
type llmOutput struct {
	Summary  string       `json:"summary"`
	Clusters []llmCluster `json:"clusters"`
}

// llmCluster represents a group of failures sharing a root cause as returned
// by the LLM.
type llmCluster struct {
	RootCause       string              `json:"root_cause"`
	Label           string              `json:"label,omitempty"`
	Classifications []llmClassification `json:"classifications"`
}

// llmClassification links one failing test to its assigned cluster and
// classification label.
type llmClassification struct {
	TestResultID   string `json:"test_result_id"`
	Classification string `json:"classification"` // new | flaky | regression | unknown
}

// validClassifications is the authoritative set of accepted classification
// strings. Any value returned by the LLM that is not in this set is
// normalised to "unknown".
var validClassifications = map[string]bool{
	"new":        true,
	"flaky":      true,
	"regression": true,
	"unknown":    true,
}
