# Test Job Template (Reference - Jobs created via API)

This template shows the structure of Jobs created by the ScaledTest platform.
**Do not apply this file directly** - Jobs are created programmatically via the API.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: test-execution-<timestamp>
  namespace: scaledtest
  labels:
    app: scaledtest
    job-type: test-execution
    project-id: <project-uuid>
    test-image-id: <image-uuid>
spec:
  # Indexed completion mode for parallel execution
  completionMode: Indexed

  # Number of tests to run
  completions: 10

  # Number of tests to run in parallel
  parallelism: 5

  # Don't retry failed tests
  backoffLimit: 0

  # Job timeout (1 hour default)
  activeDeadlineSeconds: 3600

  template:
    metadata:
      labels:
        app: scaledtest
        job-name: test-execution-<timestamp>
    spec:
      serviceAccountName: scaledtest-job-runner
      restartPolicy: Never

      # Image pull secret for private registries
      imagePullSecrets:
        - name: registry-secret-<registry-id>

      containers:
        - name: test-runner
          image: <registry>/<org>/<test-image>:<tag>

          # Command that selects test based on JOB_COMPLETION_INDEX
          command:
            - /bin/sh
            - -c
            - |
              TEST_ID=$(echo '["test1","test2","test3"]' | jq -r ".[${JOB_COMPLETION_INDEX}]")
              /app/run-test.js --run-test "$TEST_ID"

          env:
            # Platform API URL for CTRF streaming
            - name: PLATFORM_API_URL
              value: "http://scaledtest-api:8080"

            # Authentication token
            - name: JOB_AUTH_TOKEN
              value: "<jwt-token>"

            # Artifact storage path
            - name: ARTIFACT_PATH
              value: "/artifacts"

            # Job completion index (0, 1, 2, ...)
            - name: JOB_COMPLETION_INDEX
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['batch.kubernetes.io/job-completion-index']

            # Custom environment variables
            - name: NODE_ENV
              value: "test"

          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"

          volumeMounts:
            - name: artifacts
              mountPath: /artifacts
              # Subdirectory per job for isolation
              subPath: <job-uuid>

      volumes:
        - name: artifacts
          persistentVolumeClaim:
            claimName: scaledtest-artifacts
```

## Key Features

### Indexed Completion Mode

Each pod gets a unique `JOB_COMPLETION_INDEX` (0, 1, 2, ...) used to select which test to run from the test list.

### Artifact Isolation

Each job writes to a unique subdirectory: `/artifacts/<job-uuid>/`

This prevents collisions when multiple tests run in parallel.

### Resource Management

- **Requests**: Minimum guaranteed resources
- **Limits**: Maximum allowed resources
- Adjust based on test requirements

### Environment Variables

Required:

- `PLATFORM_API_URL`: Where to stream CTRF results
- `JOB_AUTH_TOKEN`: Authentication for API calls
- `ARTIFACT_PATH`: Where to save artifacts
- `JOB_COMPLETION_INDEX`: Test index (0-based)

Optional:

- Custom environment variables passed from API

### Timeouts

- `activeDeadlineSeconds`: Max job runtime (default 1 hour)
- Set via API when triggering tests

## Monitoring

```bash
# Watch job progress
kubectl get jobs -n scaledtest -l app=scaledtest -w

# Check specific job
kubectl describe job test-execution-<timestamp> -n scaledtest

# View pod status
kubectl get pods -n scaledtest -l job-name=test-execution-<timestamp>

# Get logs from specific test pod
kubectl logs -n scaledtest test-execution-<timestamp>-0-<pod-hash>

# Stream logs in real-time
kubectl logs -n scaledtest -f -l job-name=test-execution-<timestamp>
```

## Cleanup

Jobs are automatically cleaned up by the platform after completion, but you can manually delete:

```bash
# Delete specific job and its pods
kubectl delete job test-execution-<timestamp> -n scaledtest

# Delete all completed jobs
kubectl delete jobs -n scaledtest -l app=scaledtest --field-selector status.successful=1
```
