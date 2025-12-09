/**
 * ScaledTest CTRF Stream Reporter for Jest
 *
 * Custom Jest reporter that uploads test results to ScaledTest platform
 * in real-time using CTRF (Common Test Report Format) v1.0.0.
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

class CtrfStreamReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options || {};

    // Platform configuration from environment
    this.apiUrl = process.env.PLATFORM_API_URL;
    this.authToken = process.env.JOB_AUTH_TOKEN;
    this.testId = process.env.TEST_ID;
    this.projectId = process.env.PROJECT_ID;
    this.jobIndex = parseInt(process.env.JOB_COMPLETION_INDEX || "0", 10);
    this.artifactPath = process.env.ARTIFACT_PATH || "/test-artifacts";

    // Upload frequency control
    const frequency = process.env.UPLOAD_FREQUENCY || "10,30s";
    const [count, time] = frequency.split(",");
    this.uploadBatchSize = parseInt(count, 10) || 10;
    this.uploadIntervalMs = this._parseTimeString(time) || 30000;

    // State tracking
    this.pendingResults = [];
    this.totalTests = 0;
    this.uploadTimer = null;
    this.testStartTime = Date.now();

    // Validate configuration
    if (!this.apiUrl || !this.authToken) {
      console.warn(
        "⚠️  CTRF Reporter: PLATFORM_API_URL or JOB_AUTH_TOKEN not set, results will not be uploaded",
      );
      this.disabled = true;
    } else {
      this.disabled = false;
      console.log(
        `✓ CTRF Reporter initialized (upload: ${this.uploadBatchSize} tests or ${this.uploadIntervalMs}ms)`,
      );
    }

    // Start periodic upload timer
    if (!this.disabled) {
      this._startUploadTimer();
    }
  }

  /**
   * Parse time string like "30s" to milliseconds
   */
  _parseTimeString(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d+)(ms|s|m)?$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2] || "ms";

    switch (unit) {
      case "ms":
        return value;
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      default:
        return value;
    }
  }

  /**
   * Start periodic upload timer
   */
  _startUploadTimer() {
    this.uploadTimer = setInterval(() => {
      if (this.pendingResults.length > 0) {
        this._uploadResults("timer");
      }
    }, this.uploadIntervalMs);
  }

  /**
   * Stop upload timer
   */
  _stopUploadTimer() {
    if (this.uploadTimer) {
      clearInterval(this.uploadTimer);
      this.uploadTimer = null;
    }
  }

  /**
   * Called when a test result is available
   */
  onTestResult(test, testResult, aggregatedResult) {
    if (this.disabled) return;

    // Convert Jest test results to CTRF format
    const ctrfTests = testResult.testResults.map((t) =>
      this._convertTestToCTRF(t, testResult),
    );

    // Add to pending results
    this.pendingResults.push(...ctrfTests);
    this.totalTests += ctrfTests.length;

    // Upload if batch size reached
    if (this.pendingResults.length >= this.uploadBatchSize) {
      this._uploadResults("batch");
    }
  }

  /**
   * Called when all tests are complete
   */
  async onRunComplete(contexts, aggregatedResults) {
    this._stopUploadTimer();

    if (this.disabled) return;

    // Upload any remaining results
    if (this.pendingResults.length > 0) {
      await this._uploadResults("final");
    }

    const testEndTime = Date.now();
    const totalDuration = testEndTime - this.testStartTime;

    console.log("");
    console.log("=".repeat(60));
    console.log("CTRF Upload Summary");
    console.log("=".repeat(60));
    console.log(`Total Tests:     ${this.totalTests}`);
    console.log(`Total Duration:  ${totalDuration}ms`);
    console.log(`API Endpoint:    ${this.apiUrl}/api/v1/test-results/stream`);
    console.log("=".repeat(60));
  }

  /**
   * Convert Jest test result to CTRF format
   */
  _convertTestToCTRF(jestTest, testResult) {
    const status =
      jestTest.status === "passed"
        ? "passed"
        : jestTest.status === "failed"
          ? "failed"
          : jestTest.status === "pending"
            ? "pending"
            : jestTest.status === "skipped"
              ? "skipped"
              : "other";

    // Collect artifacts if test failed
    const attachments = this._collectArtifacts(jestTest);

    return {
      name: jestTest.title,
      status,
      duration: jestTest.duration || 0,
      suite: jestTest.ancestorTitles.join(" > "),
      message:
        jestTest.failureMessages.length > 0
          ? jestTest.failureMessages[0]
          : null,
      trace: jestTest.failureMessages.join("\n") || null,
      screenshot:
        attachments.find((a) => a.contentType?.startsWith("image/"))?.path ||
        null,
      attachments: attachments.length > 0 ? attachments : null,
    };
  }

  /**
   * Collect test artifacts (screenshots, logs, etc.)
   */
  _collectArtifacts(jestTest) {
    const attachments = [];

    // Check for screenshots in artifact path
    try {
      const screenshotDir = path.join(this.artifactPath, "screenshots");
      if (fs.existsSync(screenshotDir)) {
        const files = fs.readdirSync(screenshotDir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if ([".png", ".jpg", ".jpeg"].includes(ext)) {
            attachments.push({
              name: file,
              contentType: `image/${ext.slice(1)}`,
              path: path.join(screenshotDir, file),
            });
          }
        }
      }
    } catch (error) {
      // Ignore artifact collection errors
    }

    return attachments;
  }

  /**
   * Upload results to platform
   */
  async _uploadResults(trigger) {
    if (this.pendingResults.length === 0) return;

    const resultsToUpload = [...this.pendingResults];
    this.pendingResults = []; // Clear pending immediately

    const passedCount = resultsToUpload.filter(
      (t) => t.status === "passed",
    ).length;
    const failedCount = resultsToUpload.filter(
      (t) => t.status === "failed",
    ).length;
    const skippedCount = resultsToUpload.filter(
      (t) => t.status === "skipped",
    ).length;

    const ctrfPayload = {
      results: {
        tool: {
          name: "jest",
          version: this._getJestVersion(),
        },
        summary: {
          tests: resultsToUpload.length,
          passed: passedCount,
          failed: failedCount,
          skipped: skippedCount,
          pending: 0,
          other: 0,
          start: this.testStartTime,
          stop: Date.now(),
        },
        tests: resultsToUpload,
      },
      metadata: {
        testId: this.testId,
        projectId: this.projectId,
        jobIndex: this.jobIndex,
        uploadTrigger: trigger,
      },
    };

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/v1/test-results/stream`,
        ctrfPayload,
        {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 second timeout
        },
      );

      console.log(
        `✓ Uploaded ${resultsToUpload.length} test result(s) [${trigger}] - Status: ${response.status}`,
      );
    } catch (error) {
      console.error(
        `✗ Failed to upload test results [${trigger}]:`,
        error.message,
      );

      // Re-add failed results to pending (with limit to prevent memory issues)
      if (this.pendingResults.length < 1000) {
        this.pendingResults.unshift(...resultsToUpload);
      }
    }
  }

  /**
   * Get Jest version
   */
  _getJestVersion() {
    try {
      const jestPackage = require("jest/package.json");
      return jestPackage.version;
    } catch {
      return "unknown";
    }
  }
}

module.exports = CtrfStreamReporter;
