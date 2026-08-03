import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDbEYx361Xg3KfHoghlHAYTC-b8g6Yy2I8",
    authDomain: "thesnackstation-c6ff9.firebaseapp.com",
    projectId: "thesnackstation-c6ff9",
    storageBucket: "thesnackstation-c6ff9.firebasestorage.app",
    messagingSenderId: "830977242508",
    appId: "1:830977242508:web:cac072840fc4c9366c12a9",
    measurementId: "G-V404QLEB66"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();