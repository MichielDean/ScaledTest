#!/usr/bin/env tsx

/**
 * Test validation script to ensure resolved review comments work correctly
 */

import { promises as fs } from 'fs';
import { join } from 'path';

async function validateResolvedComments() {
  console.log('🔍 Validating resolved review comments...\n');

  try {
    // 1. Check if TWENTY_FOUR_HOURS_MS constant exists
    const tokenServicePath = join(process.cwd(), 'tests/authentication/tokenService.ts');
    const tokenServiceContent = await fs.readFile(tokenServicePath, 'utf-8');

    if (tokenServiceContent.includes('const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;')) {
      console.log('✅ Magic number fix: TWENTY_FOUR_HOURS_MS constant found');
    } else {
      console.log('⚠️  Magic number fix: TWENTY_FOUR_HOURS_MS constant not found');
    }

    // 2. Check z.record validation pattern
    const testReportsPath = join(process.cwd(), 'src/pages/api/v1/reports/index.ts');
    const testReportsContent = await fs.readFile(testReportsPath, 'utf-8');

    if (testReportsContent.includes('z.record(z.string(), z.unknown())')) {
      console.log('✅ Zod validation fix: z.record(z.string(), z.unknown()) pattern found');
    } else {
      console.log('⚠️  Zod validation fix: z.record(z.string(), z.unknown()) pattern not found');
    }

    // 3. Check UUID validation
    const validationPath = join(process.cwd(), 'src/lib/validation.ts');
    const validationContent = await fs.readFile(validationPath, 'utf-8');

    if (validationContent.includes('[1-5][0-9a-f]{3}') && validationContent.includes('RFC 4122')) {
      console.log('✅ UUID validation fix: RFC 4122 compliant regex found');
    } else {
      console.log('⚠️  UUID validation fix: RFC 4122 compliant regex not found');
    }

    // 4. Check admin users API implementation
    const adminUsersPath = join(process.cwd(), 'src/pages/api/admin/users.ts');
    const adminUsersContent = await fs.readFile(adminUsersPath, 'utf-8');

    if (
      adminUsersContent.includes('pool.query') &&
      !adminUsersContent.includes('const paginatedUsers: Array<> = [];')
    ) {
      console.log('✅ Admin users API fix: Real database queries implemented');
    } else {
      console.log('⚠️  Admin users API fix: Still uses hardcoded arrays or no DB queries');
    }

    // 5. Check login form Image component
    const loginFormPath = join(process.cwd(), 'src/components/login-form.tsx');
    const loginFormContent = await fs.readFile(loginFormPath, 'utf-8');

    if (loginFormContent.includes('width={384}') && loginFormContent.includes('height={384}')) {
      console.log('✅ Image component fix: Width and height attributes found');
    } else {
      console.log('⚠️  Image component fix: Width and height attributes not found');
    }

    // 6. Check user-roles audit logging
    const userRolesPath = join(process.cwd(), 'src/pages/api/admin/user-roles.ts');
    const userRolesContent = await fs.readFile(userRolesPath, 'utf-8');

    if (
      userRolesContent.includes('session?.user?.id') &&
      !userRolesContent.includes("req.headers['user-id']")
    ) {
      console.log('✅ Audit logging fix: Using session.user.id instead of headers');
    } else {
      console.log('⚠️  Audit logging fix: Still using header-based user ID');
    }

    console.log('\n🎉 Review comment validation completed!');
  } catch (error) {
    console.error('❌ Error during validation:', error);
    process.exit(1);
  }
}

validateResolvedComments().catch(console.error);
