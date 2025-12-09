package models

import (
	"encoding/json"
	"strconv"
)

// FlexibleStringArray can unmarshal from either a string or an array of strings
// This handles the case where CTRF reporters send "suite" as a string instead of an array
type FlexibleStringArray []string

// UnmarshalJSON implements json.Unmarshaler
func (f *FlexibleStringArray) UnmarshalJSON(data []byte) error {
	// First try to unmarshal as an array
	var arr []string
	if err := json.Unmarshal(data, &arr); err == nil {
		*f = arr
		return nil
	}

	// If that fails, try as a single string
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return err
	}
	*f = []string{str}
	return nil
}

// MarshalJSON implements json.Marshaler
func (f FlexibleStringArray) MarshalJSON() ([]byte, error) {
	return json.Marshal([]string(f))
}

// FlexibleInt can unmarshal from either an int or a string
// This handles the case where CTRF reporters send buildNumber as "0" instead of 0
type FlexibleInt int

// UnmarshalJSON implements json.Unmarshaler
func (f *FlexibleInt) UnmarshalJSON(data []byte) error {
	// First try to unmarshal as an int
	var i int
	if err := json.Unmarshal(data, &i); err == nil {
		*f = FlexibleInt(i)
		return nil
	}

	// If that fails, try as a string
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return err
	}

	// Try to parse the string as an int
	parsed, err := strconv.Atoi(str)
	if err != nil {
		return err
	}
	*f = FlexibleInt(parsed)
	return nil
}

// MarshalJSON implements json.Marshaler
func (f FlexibleInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(int(f))
}

// Int returns the int value
func (f FlexibleInt) Int() int {
	return int(f)
}
