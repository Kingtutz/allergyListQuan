# Firebase Setup Instructions

## Steps to enable Firebase sync:

1. **Go to [Firebase Console](https://console.firebase.google.com/)**

2. **Create a new project** or select existing one

3. **Enable Realtime Database:**
   - In the left menu, click "Realtime Database"
   - Click "Create Database"
   - Choose location (e.g., us-central1)
   - Start in **test mode** for now (we'll secure it later)

4. **Get your config:**
   - Click the gear icon ⚙️ next to "Project Overview"
   - Click "Project settings"
   - Scroll down to "Your apps"
   - Click the `</>` (web) icon
   - Register your app
   - Copy the `firebaseConfig` object

5. **Update src/firebase.ts:**
   - Open `src/firebase.ts`
   - Replace the placeholder `firebaseConfig` object with your actual config

6. **Secure your database (IMPORTANT):**
   Once working, update Realtime Database Rules to:
   ```json
   {
     "rules": {
       "recipes": {
         ".read": true,
         ".write": true
       },
       "dishes": {
         ".read": true,
         ".write": true
       },
       "masterIngredients": {
         ".read": true,
         ".write": true
      },
      "allergenKeywords": {
        ".read": true,
        ".write": true
       }
     }
   }
   ```
   
   For better security with authentication, use:
   ```json
   {
     "rules": {
       "recipes": {
         ".read": "auth != null",
         ".write": "auth != null"
       },
       "dishes": {
         ".read": "auth != null",
         ".write": "auth != null"
       },
       "masterIngredients": {
         ".read": "auth != null",
         ".write": "auth != null"
      },
      "allergenKeywords": {
        ".read": "auth != null",
        ".write": "auth != null"
       }
     }
   }
   ```

## How it works:

- ✅ All recipe changes automatically sync to Firebase
- ✅ Multiple devices/browsers stay in sync
- ✅ localStorage is kept as backup
- ✅ Works offline, syncs when reconnected

If Firebase config is not set up, the app falls back to localStorage only.
