/**
 * Validation schemas for the application
 *
 * This file contains Zod validation schemas used throughout the application.
 * These schemas provide runtime type validation and documentation.
 */

import { z } from 'zod';
import { HttpMethod } from './common';

// Validation schema for HttpMethod enum
export const HttpMethodSchema = z.nativeEnum(HttpMethod);
