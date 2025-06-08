/**
 * Database and API-related type definitions
 *
 * This file contains types used for database storage and API responses
 * that extend the core CTRF schema with additional fields.
 */

import { CtrfSchema } from '../schemas/ctrf/ctrf';

/**
 * Stored report structure for database persistence
 * Extends the CTRF schema with database-specific fields
 */
export interface StoredReport extends CtrfSchema {
  _id: string;
  storedAt: string;
}
