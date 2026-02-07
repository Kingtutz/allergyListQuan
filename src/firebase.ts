import { initializeApp } from 'firebase/app';
import { getDatabase as getFirebaseDatabase, ref, set, onValue, Database } from 'firebase/database';

// TODO: Replace with your Firebase project configuration
// Get this from Firebase Console > Project Settings > Your apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyC0zN0VA8PWXFhzADPzqXqJuEnJrfIv0YI",
  authDomain: "allergy-978c9.firebaseapp.com",
  databaseURL: "https://allergy-978c9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "allergy-978c9",
  storageBucket: "allergy-978c9.firebasestorage.app",
  messagingSenderId: "856979409488",
  appId: "1:856979409488:web:fce3e9df1844bd8b5a9f55"
};
let database: Database | null = null;

export function initFirebase(): Database | null {
  // Check if config is still default
  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn('Firebase not configured. Using localStorage only.');
    return null;
  }

  try {
    const app = initializeApp(firebaseConfig);
    database = getFirebaseDatabase(app);
    console.log('Firebase initialized successfully');
    return database;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
}

export function saveRecipesToFirebase(recipes: any[]): void {
  if (!database) return;
  
  try {
    const recipesRef = ref(database, 'recipes');
    set(recipesRef, recipes);
  } catch (error) {
    console.error('Error saving to Firebase:', error);
  }
}

export function listenToRecipes(callback: (recipes: any[]) => void): void {
  if (!database) return;
  
  const recipesRef = ref(database, 'recipes');
  onValue(recipesRef, (snapshot) => {
    const data = snapshot.val();
    callback(data || []);
  });
}

export function getDatabase() {
  return database;
}
