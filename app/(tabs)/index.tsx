import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.text}>Benvenuto su GymFabius! 💪</Text>
        <Text style={styles.textSub}>Cosa succede in palestra oggi?</Text>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>INGRESSI {"\n"} 0</Text>
          <Ionicons name="log-out-outline" size={30} color={'#459E7B'} />
        </View>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>ISCRITTI {"\n"} 0</Text>
          <Ionicons name="person-add-outline" size={30} color={'#A77BFF'} />
        </View>
      </View>

      {/* Contenitore con altezza controllata */}
      <View style={styles.listWrapper}>
        <View style={styles.header1}>
          <Ionicons name="timer-outline" size={24} color="#5CB4EA" />
          <Text style={styles.listTitle}>Ingressi di Oggi</Text>
          <Text style={styles.listTitle1}>Vedi Tutti</Text>
        </View>


        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Esempio di riga con testo protetto */}
          

          <View style={styles.itemRow}>
            <Ionicons name="ellipse-sharp" size={24} color="#64def3" />
            <Text style={styles.itemText} numberOfLines={1}>Luca Bianchi</Text>
            <Text style={styles.itemText1} numberOfLines={1}>18:25</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  header: { 
    textAlign: 'center',
    marginBottom: 30,
  },
  header1: { 
    // alignItems: 'center', 
    flexDirection:'row',
    justifyContent:'space-evenly',
    marginBottom: 10,
  },

  container: {
    flex: 1,
    backgroundColor: '#101010',
    alignItems: 'center',
    paddingTop: 60,
  },
  text: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  textSub: { fontSize: 18, color: '#aaa', marginTop: 5 },

  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 10,
  },
  blocco: {
    flexDirection: 'row',
    backgroundColor: '#1A1C24',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '45%',
    padding: 15,
    borderRadius: 20,
  },
  textinfo: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Gestione Altezza Box
  listWrapper: {
    height: 300, // Altezza fissa per evitare che occupi tutto lo schermo
    width: '90%',
    backgroundColor: '#1A1C24',
    marginTop: 30,
    borderRadius: 25,
    padding: 20,
  },
  listTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  listTitle1: { color: '#5CB4EA', fontSize: 16, fontWeight: 'bold' },

  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 10 },

  // Stile per la riga dell'iscritto
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252833',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    // justifyContent: 'space-between',
  },
  itemText: {
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
});