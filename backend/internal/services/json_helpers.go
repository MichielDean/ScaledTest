package services

import "encoding/json"

// jsonToMap parses a JSON string into a map[string]string
// Returns an empty map if parsing fails
func jsonToMap(jsonStr string) map[string]string {
	result := make(map[string]string)
	if jsonStr == "" || jsonStr == "{}" {
		return result
	}
	json.Unmarshal([]byte(jsonStr), &result)
	return result
}

// mapToJSON converts a map[string]string to a JSON string
// Returns "{}" for empty or nil maps
func mapToJSON(m map[string]string) string {
	if len(m) == 0 {
		return "{}"
	}
	bytes, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(bytes)
}
