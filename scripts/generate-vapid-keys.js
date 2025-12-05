#!/usr/bin/env node
/**
 * Generate VAPID Keys for Web Push Notifications
 * Run this script once to generate your VAPID keys for push notifications
 *
 * Usage: node scripts/generate-vapid-keys.js
 */

const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

console.log('🔑 Generating VAPID keys for Web Push notifications...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ VAPID keys generated successfully!\n');
console.log('📋 Copy these to your .env.local file:\n');
console.log('─'.repeat(60));
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com`);
console.log('─'.repeat(60));

console.log('\n⚠️  Important:');
console.log('1. Keep the private key SECRET - never commit it to version control');
console.log('2. Update VAPID_SUBJECT with your actual contact email');
console.log('3. The public key is safe to expose to the client');

// Optionally append to .env.local if it exists
const envPath = path.join(process.cwd(), '.env.local');
const envExists = fs.existsSync(envPath);

if (envExists) {
  console.log('\n❓ Would you like to append these to .env.local? (y/n)');

  process.stdin.once('data', (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === 'y' || answer === 'yes') {
      const envContent = `\n# VAPID Keys for Push Notifications (Generated ${new Date().toISOString()})\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}\nVAPID_PRIVATE_KEY=${vapidKeys.privateKey}\nVAPID_SUBJECT=mailto:your-email@example.com\n`;

      fs.appendFileSync(envPath, envContent);
      console.log('✅ Keys appended to .env.local');
      console.log('⚠️  Remember to update VAPID_SUBJECT with your email!');
    } else {
      console.log('Keys not saved. Copy them manually to .env.local');
    }

    process.exit(0);
  });
} else {
  console.log('\n💡 Tip: Create a .env.local file and add these variables');
  process.exit(0);
}
