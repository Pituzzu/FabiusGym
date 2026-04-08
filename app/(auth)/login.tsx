import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
// 1. Importiamo il componente
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = () => {
    console.log("Login con:", email, password);
    router.replace('/(tabs)');
  };

  return (
    // 2. Sostituiamo View con LinearGradient e definiamo i colori
    <LinearGradient
      // Colori: dal nero a un blu scuro aziendale
      colors={['#000000', '#171717', '#323030']} 
      style={styles.container}
    >
      {/* 3. Aggiungiamo KeyboardAvoidingView per non coprire gli input con la tastiera (Professionale!) */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerContainer}
      >
        <Text style={styles.title}>GymFabius</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#aaa"
          keyboardType="email-address" // Ottimizzazione tastiera
          autoCapitalize="none" // Evita maiuscole automatiche
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

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Accedi</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, // Occupa tutto lo schermo
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 50, letterSpacing: 1 },
  input: { 
    width: '100%', height: 55, backgroundColor: 'rgba(255,255,255,0.08)', // Sfondo input semi-trasparente
    borderRadius: 12, paddingHorizontal: 15, color: '#fff', marginBottom: 20, fontSize: 16
  },
  button: { 
    width: '100%', height: 55, backgroundColor: '#229753', borderRadius: 12, 
    justifyContent: 'center', alignItems: 'center', marginTop: 15,
    // Ombra per il bottone (iOS)
    shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5,
    // Ombra per il bottone (Android)
    elevation: 5,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' }
});