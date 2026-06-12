import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Incolla qui l'oggetto configurazione che hai trovato sulla console di Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD1oLQ7ooISkQxVcAEs2QUCiIzL3e6oBew",
  authDomain: "fabiusgym.firebaseapp.com",
  projectId: "fabiusgym",
  storageBucket: "fabiusgym.firebasestorage.app",
  messagingSenderId: "717899273364",
  appId: "1:717899273364:web:a7db3c05ef26e76c4a9081",
  measurementId: "G-6K2691SYKY"
};

// Inizializziamo i servizi
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
