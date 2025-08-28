#!/usr/bin/env tsx

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Generate favicon files from the source icon
 * Creates multiple sizes optimized for different use cases
 */

const FAVICON_SIZES = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

async function generateFavicons() {
  const sourceIcon = path.join(process.cwd(), 'public', 'icon.png');
  const publicDir = path.join(process.cwd(), 'public');

  try {
    // Verify source file exists
    await fs.access(sourceIcon);
    console.log('📋 Source icon found:', sourceIcon);

    // Get source image info
    const imageInfo = await sharp(sourceIcon).metadata();
    console.log(`📐 Source dimensions: ${imageInfo.width}x${imageInfo.height}`);

    // Generate each favicon size
    for (const { size, name } of FAVICON_SIZES) {
      const outputPath = path.join(publicDir, name);

      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ quality: 90, compressionLevel: 9 })
        .toFile(outputPath);

      const stats = await fs.stat(outputPath);
      console.log(`✅ Generated ${name} (${size}x${size}) - ${Math.round(stats.size / 1024)}KB`);
    }

    // Generate ICO file (use PNG as fallback since Sharp doesn't support ICO output)
    console.log('🔄 Generating favicon.ico fallback...');

    // Create a 32x32 PNG and rename it to .ico as a fallback
    await sharp(sourceIcon)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(path.join(publicDir, 'favicon.ico'));

    const icoStats = await fs.stat(path.join(publicDir, 'favicon.ico'));
    console.log(`✅ Generated favicon.ico (PNG format) - ${Math.round(icoStats.size / 1024)}KB`);

    console.log('\n🎉 Favicon generation complete!');
    console.log('\nGenerated files:');
    console.log('  • favicon.ico (main favicon)');
    console.log('  • favicon-16x16.png (small icons)');
    console.log('  • favicon-32x32.png (standard icons)');
    console.log('  • favicon-48x48.png (large icons)');
    console.log('  • icon-192.png (Android)');
    console.log('  • icon-512.png (high-res displays)');
    console.log('  • apple-touch-icon.png (iOS)');

    console.log('\n📝 Next steps:');
    console.log('  1. Update _document.tsx with proper favicon links');
    console.log('  2. Add web app manifest for PWA support');
    console.log('  3. Test favicons in different browsers');
  } catch (error) {
    console.error('❌ Error generating favicons:', error);
    process.exit(1);
  }
}

// Run the script
generateFavicons();

export default generateFavicons;
