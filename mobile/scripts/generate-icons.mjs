import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');

const YELLOW = '#EAB308';
const BG_DARK = '#09090B';

// App Icon (1024x1024) - Yellow "R" on dark background with rounded corners
async function generateIcon() {
  const size = 1024;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="180" ry="180" fill="${BG_DARK}"/>
      <rect x="212" y="212" width="600" height="600" rx="120" ry="120" fill="${YELLOW}"/>
      <text x="512" y="580" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="420" font-weight="900" fill="${BG_DARK}" text-anchor="middle" dominant-baseline="middle">R</text>
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
  console.log('Generated icon.png');
}

// Adaptive Icon foreground (1024x1024) - just the "R" centered (transparent bg, Android adds its own bg)
async function generateAdaptiveIcon() {
  const size = 1024;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="212" y="212" width="600" height="600" rx="120" ry="120" fill="${YELLOW}"/>
      <text x="512" y="580" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="420" font-weight="900" fill="${BG_DARK}" text-anchor="middle" dominant-baseline="middle">R</text>
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('Generated adaptive-icon.png');
}

// Splash icon (200x200 for Expo splash)
async function generateSplashIcon() {
  const size = 512;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="500" height="500" rx="100" ry="100" fill="${YELLOW}"/>
      <text x="256" y="290" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="340" font-weight="900" fill="${BG_DARK}" text-anchor="middle" dominant-baseline="middle">R</text>
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('Generated splash-icon.png');
}

// Favicon (48x48)
async function generateFavicon() {
  const size = 256;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="48" ry="48" fill="${YELLOW}"/>
      <text x="128" y="148" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="180" font-weight="900" fill="${BG_DARK}" text-anchor="middle" dominant-baseline="middle">R</text>
    </svg>
  `;
  await sharp(Buffer.from(svg)).resize(48, 48).png().toFile(path.join(assetsDir, 'favicon.png'));
  console.log('Generated favicon.png');
}

async function main() {
  try {
    await generateIcon();
    await generateAdaptiveIcon();
    await generateSplashIcon();
    await generateFavicon();
    console.log('All icons generated successfully!');
  } catch (err) {
    console.error('Error generating icons:', err);
    process.exit(1);
  }
}

main();
