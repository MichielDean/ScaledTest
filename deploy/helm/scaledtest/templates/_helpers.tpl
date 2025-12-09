{{/*
Expand the name of the chart.
*/}}
{{- define "scaledtest.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "scaledtest.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "scaledtest.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "scaledtest.labels" -}}
helm.sh/chart: {{ include "scaledtest.chart" . }}
{{ include "scaledtest.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "scaledtest.selectorLabels" -}}
app.kubernetes.io/name: {{ include "scaledtest.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "scaledtest.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "scaledtest.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Backend image
*/}}
{{- define "scaledtest.backend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.backend.image.tag }}
{{- printf "%s:%s" .Values.backend.image.repository $tag }}
{{- end }}

{{/*
Frontend image
*/}}
{{- define "scaledtest.frontend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.frontend.image.tag }}
{{- printf "%s:%s" .Values.frontend.image.repository $tag }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "scaledtest.databaseUrl" -}}
{{- $host := include "scaledtest.databaseHost" . }}
{{- $port := "5432" }}
{{- $user := .Values.database.auth.username | default "scaledtest" }}
{{- $db := .Values.database.auth.database | default "scaledtest" }}
{{- printf "postgresql://%s:$(DB_PASSWORD)@%s:%s/%s?sslmode=disable" $user $host $port $db }}
{{- end }}

{{/*
Database host
*/}}
{{- define "scaledtest.databaseHost" -}}
{{- printf "%s-postgresql" (include "scaledtest.fullname" .) }}
{{- end }}

{{/*
Database port
*/}}
{{- define "scaledtest.databasePort" -}}
5432
{{- end }}

{{/*
Database user
*/}}
{{- define "scaledtest.databaseUser" -}}
{{- .Values.database.auth.username | default "scaledtest" }}
{{- end }}

{{/*
Database name
*/}}
{{- define "scaledtest.databaseName" -}}
{{- .Values.database.auth.database | default "scaledtest" }}
{{- end }}

{{/*
Database secret name
*/}}
{{- define "scaledtest.databaseSecretName" -}}
{{- if .Values.database.auth.existingSecret }}
{{- .Values.database.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "scaledtest.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Database secret key
*/}}
{{- define "scaledtest.databaseSecretKey" -}}
password
{{- end }}

{{/*
JWT secret name
*/}}
{{- define "scaledtest.jwtSecretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "scaledtest.fullname" .) }}
{{- end }}
{{- end }}

{{/*
MinIO secret name
*/}}
{{- define "scaledtest.minioSecretName" -}}
{{- if .Values.minio.auth.existingSecret }}
{{- .Values.minio.auth.existingSecret }}
{{- else }}
{{- printf "%s-minio" (include "scaledtest.fullname" .) }}
{{- end }}
{{- end }}
