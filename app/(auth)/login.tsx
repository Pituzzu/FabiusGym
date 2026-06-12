import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { auth } from '../config/firebaseConfig'; // Adatta il percorso

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [caricamento, setCaricamento] = useState(false); // Stato per il caricamento
  const router = useRouter();

  const handleLogin = async () => {
    // 1. Validazione base
    if (!email || !password) {
      Alert.alert("Errore", "Per favore, inserisci sia l'email che la password. 🛑");
      return;
    }

    setCaricamento(true); // Inizia il caricamento

    try {
      // 2. Tentativo di autenticazione con Firebase
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
      console.log('Accesso eseguito! ✅');
      
      // 3. Navigazione verso la Dashboard
      router.replace('/(tabs)');
      
    } catch (error: any) {
      // 4. Gestione degli errori comuni
      let messaggioErrore = "Si è verificato un errore durante l'accesso.";
      
      if (error.code === 'auth/invalid-email') messaggioErrore = "L'indirizzo email non è valido. 📧";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        messaggioErrore = "Email o password errati. 🔑";
      }

      Alert.alert("Accesso fallito", messaggioErrore);
      console.error(error.code);
    } finally {
      setCaricamento(false); // Ferma il caricamento in ogni caso
    }
  };

  return (
    <LinearGradient
      colors={['#000000', '#171717', '#323030']} 
      style={styles.container}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerContainer}
      >
        <Text style={styles.title}>GymFabius</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#aaa"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#aaa"
          secureTextEntry={true}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity 
          style={[styles.button, caricamento && { opacity: 0.7 }]} 
          onPress={handleLogin}
          disabled={caricamento} // Disabilita il tasto se sta caricando
        >
          {caricamento ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Accedi</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 50, letterSpacing: 1 },
  input: { 
    width: '100%', height: 55, backgroundColor: 'rgba(255,255,255,0.08)', 
    borderRadius: 12, paddingHorizontal: 15, color: '#fff', marginBottom: 20, fontSize: 16
  },
  button: { 
    width: '100%', height: 55, backgroundColor: '#229753', borderRadius: 12, 
    justifyContent: 'center', alignItems: 'center', marginTop: 15,
    elevation: 5,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' }
});
