// Package storage provides object storage implementations for artifact management.
package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

// Config holds S3/MinIO connection configuration.
type Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Region    string
}

// S3Storage provides S3-compatible object storage operations.
type S3Storage struct {
	client *minio.Client
	bucket string
	logger *zap.Logger
}

// NewS3Storage creates a new S3Storage instance.
func NewS3Storage(cfg Config, logger *zap.Logger) (*S3Storage, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	storage := &S3Storage{
		client: client,
		bucket: cfg.Bucket,
		logger: logger,
	}

	// Ensure bucket exists
	if err := storage.ensureBucket(context.Background()); err != nil {
		return nil, fmt.Errorf("ensure bucket exists: %w", err)
	}

	logger.Info("S3 storage initialized",
		zap.String("endpoint", cfg.Endpoint),
		zap.String("bucket", cfg.Bucket),
		zap.Bool("ssl", cfg.UseSSL))

	return storage, nil
}

// ensureBucket creates the bucket if it doesn't exist.
func (s *S3Storage) ensureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("check bucket exists: %w", err)
	}

	if !exists {
		err = s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
		if err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
		s.logger.Info("Created bucket", zap.String("bucket", s.bucket))
	}

	return nil
}

// UploadArtifact uploads an artifact to S3 storage.
func (s *S3Storage) UploadArtifact(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, objectKey, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("upload object: %w", err)
	}

	s.logger.Debug("Uploaded artifact",
		zap.String("bucket", s.bucket),
		zap.String("key", objectKey),
		zap.Int64("size", size))

	return nil
}

// GetArtifact retrieves an artifact from S3 storage.
func (s *S3Storage) GetArtifact(ctx context.Context, objectKey string) (io.ReadCloser, *ObjectInfo, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("get object: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, nil, fmt.Errorf("stat object: %w", err)
	}

	info := &ObjectInfo{
		Key:          stat.Key,
		Size:         stat.Size,
		ContentType:  stat.ContentType,
		LastModified: stat.LastModified,
		ETag:         stat.ETag,
	}

	return obj, info, nil
}

// GetPresignedURL generates a presigned URL for downloading an artifact.
func (s *S3Storage) GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	reqParams := make(url.Values)
	presignedURL, err := s.client.PresignedGetObject(ctx, s.bucket, objectKey, expiry, reqParams)
	if err != nil {
		return "", fmt.Errorf("generate presigned URL: %w", err)
	}

	return presignedURL.String(), nil
}

// DeleteArtifact deletes an artifact from S3 storage.
func (s *S3Storage) DeleteArtifact(ctx context.Context, objectKey string) error {
	err := s.client.RemoveObject(ctx, s.bucket, objectKey, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}

	s.logger.Debug("Deleted artifact",
		zap.String("bucket", s.bucket),
		zap.String("key", objectKey))

	return nil
}

// DeleteArtifactsByPrefix deletes all artifacts matching a prefix.
func (s *S3Storage) DeleteArtifactsByPrefix(ctx context.Context, prefix string) (int, error) {
	objectsCh := s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	deleted := 0
	for obj := range objectsCh {
		if obj.Err != nil {
			return deleted, fmt.Errorf("list objects: %w", obj.Err)
		}

		err := s.client.RemoveObject(ctx, s.bucket, obj.Key, minio.RemoveObjectOptions{})
		if err != nil {
			s.logger.Warn("Failed to delete object",
				zap.String("key", obj.Key),
				zap.Error(err))
			continue
		}
		deleted++
	}

	s.logger.Info("Deleted artifacts by prefix",
		zap.String("prefix", prefix),
		zap.Int("deleted", deleted))

	return deleted, nil
}

// ListArtifacts lists artifacts with an optional prefix.
func (s *S3Storage) ListArtifacts(ctx context.Context, prefix string, maxKeys int) ([]ObjectInfo, error) {
	objectsCh := s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	var objects []ObjectInfo
	count := 0
	for obj := range objectsCh {
		if obj.Err != nil {
			return nil, fmt.Errorf("list objects: %w", obj.Err)
		}

		objects = append(objects, ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			LastModified: obj.LastModified,
			ETag:         obj.ETag,
		})

		count++
		if maxKeys > 0 && count >= maxKeys {
			break
		}
	}

	return objects, nil
}

// ObjectInfo contains metadata about a stored object.
type ObjectInfo struct {
	Key          string
	Size         int64
	ContentType  string
	LastModified time.Time
	ETag         string
}

// ObjectStorage defines the interface for artifact storage operations.
type ObjectStorage interface {
	UploadArtifact(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error
	GetArtifact(ctx context.Context, objectKey string) (io.ReadCloser, *ObjectInfo, error)
	GetPresignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error)
	DeleteArtifact(ctx context.Context, objectKey string) error
	DeleteArtifactsByPrefix(ctx context.Context, prefix string) (int, error)
	ListArtifacts(ctx context.Context, prefix string, maxKeys int) ([]ObjectInfo, error)
}

// Compile-time interface check
var _ ObjectStorage = (*S3Storage)(nil)
