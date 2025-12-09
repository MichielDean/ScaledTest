// Package repository provides data access layer for ScaledTest.
//
// Repositories encapsulate all SQL queries and data mapping logic,
// separating persistence concerns from business logic in services.
//
// Each repository corresponds to an aggregate root in the domain model:
//   - ProjectRepository: Projects and related settings
//   - ClusterRepository: K8s clusters and credentials
//   - UserRepository: Users and profiles
//   - TestResultRepository: CTRF reports and test results
//
// All repositories accept a database.Executor interface, allowing them
// to work with both direct connections and transactions.
package repository
