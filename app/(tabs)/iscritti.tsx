import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Iscritti() {

  const [iscrizione, setIscrizione] = useState(false);
  const [valore, setValore] = useState('Seleziona Abbonamento');
  const [showDropdown, setShowDropdown] = useState(false);

  const opzioni = ['Mensile', 'Trimestrale', 'Annuale'];
const handleTextChange = (inputText: string) => {
  // 1. Rimuoviamo tutto ciò che non è un numero usando una Regex
  const cleanedText = inputText.replace(/[^0-9]/g, '');

  // Se il campo viene svuotato, resettiamo lo stato e usciamo
  if (cleanedText === '') {
    setValore('');
    return;
  }

  // 2. Convertiamo la stringa in un numero intero
  const numericValue = parseInt(cleanedText, 10);

  // 3. Applichiamo la logica del Range (Min: 1, Max: 100)
  if (numericValue >= 1 && numericValue <= 5) {
    // Se è nel range, salviamo il testo pulito
    setValore(cleanedText);
  } else if (numericValue > 5) {
    // Se supera il massimo, decidiamo cosa fare (es. forzare a 100)
    setValore('5');
  } else if (numericValue < 1) {
    // Se è sotto il minimo, decidiamo cosa fare (es. forzare a 1)
    setValore('1');
  }
};
  return (
    <View style={styles.container}>
      {/* <Text style={styles.text}>Iscritti GymFabius 📋</Text> */}
      <View style={styles.infoContainer}>
        <View style={styles.area_ricerca}>
          <TextInput placeholder='Cerca iscritto' style={styles.textarea} placeholderTextColor="#888" />
          <TouchableOpacity onPress={() => setIscrizione(true)}>
            <View style={styles.btn}>
              <Text style={styles.txtbtn}>+ Nuovo Iscritto</Text>
            </View>

          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
      >
        {/* Esempio di riga con testo protetto */}



        <View style={styles.itemRow}>
          <Ionicons name="ellipse-sharp" size={24} color="#64def3" />
          <Text style={styles.itemText} numberOfLines={1}>Luca Bianchi</Text>
          <Text style={styles.itemText1} numberOfLines={1}>Modifica</Text>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={iscrizione}
        onRequestClose={() => setIscrizione(false)} // Gestisce il tasto "indietro" su Android
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Nuovo Iscritto 🏋️‍♂️</Text>

            <TextInput
              placeholder='Nome e Cognome'
              style={styles.textareamodal}
              placeholderTextColor="#888"
            />

            <TextInput
              placeholder='Card ID'
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric" // Ottimizza la tastiera per i numeri
            />
            <TextInput
              keyboardType="numeric" // Mostra solo i numeri su iOS e Android 🔢
              onChangeText={handleTextChange} // Funzione che controllerà i limiti
              value={valore}
              placeholder="Frequenza settimanale (1-5)"
              placeholderTextColor="#888"
              style={styles.textareamodal}
            />

            <TextInput
              placeholder='Prezzo Abbonamento (€)'
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric" // Ottimizza la tastiera per i numeri
            />
            <Text style={{color:'gray', textAlign:'center', fontSize:12, marginBottom:10}}>N.B La data di scadenza è calcolato 30 giorni dall'iscrizione </Text>

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.buttonAdd]}
                onPress={() => {
                  /* Qui aggiungeremo la logica per salvare */
                  setIscrizione(false);
                }}
              >
                <Text style={styles.buttonText}>Aggiungi</Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.buttonClose]}
                onPress={() => setIscrizione(false)}
              >
                <Text style={styles.buttonText}>Annulla</Text>
              </Pressable>
            </View>

          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#101010',
  },

  text: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 80

  },

  infoContainer: {
    marginTop: 80,
    width: '90%',
    backgroundColor: '#1A1C24',
    flexDirection: 'row',
    borderRadius: 20,

  },

  area_ricerca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 15,

  },

  textarea: {
    // backgroundColor: '#fff',
    width: '60%',
    color: 'white'
  },


  txtbtn: {
    color: 'white',
    padding: 10,
  },
  btn: {
    backgroundColor: '#141414',
    padding: 10,
    borderRadius: 20,

  },

  scrollView: {
    // flex: 1,
    maxHeight: '50%',
    // backgroundColor:'#fff',
    width: '80%',
    marginTop: 40

  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252833',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    // justifyContent: 'space-between',
  }, itemText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
    flex: 1, // Costringe il testo a occupare lo spazio rimanente senza uscire
  },
  itemText1: {
    color: '#aaa',
    fontSize: 14,
    marginLeft: 10,
    flexShrink: 0, // Impedisce al testo dell'orario di ridursi
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center', // Centra il modal verticalmente
    alignItems: 'center',     // Centra il modal orizzontalmente
    backgroundColor: 'rgb(0, 0, 0)', // Sfondo nero al 70% di opacità
  }, modalView: {
    width: '80%',
    backgroundColor: '#1A1C24', // Colore scuro per GymFabius
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5, // Importante per l'ombra su Android
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  textareamodal: {
    width: '100%',
    backgroundColor: '#252833',
    borderRadius: 10,
    padding: 15,
    color: '#fff',
    marginBottom: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  buttonAdd: {
    backgroundColor: '#459E7B', // Verde per confermare
  },
  buttonClose: {
    backgroundColor: '#bb1414', // Rosso per annullare
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});