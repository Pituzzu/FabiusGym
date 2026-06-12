import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebaseConfig';

// Definiamo l'interfaccia per i dati del socio
interface SocioIngresso {
  id: string;
  nome?: string;
  cognome?: string;
  cardId?: string;
  socioId?: string;
  ingresso?: {
    toDate?: () => Date;
  };
  uscita?: {
    toDate?: () => Date;
  };
  uscitaByAdmin?: boolean;
}

type FasciaStorico = 'mattina' | 'pomeriggio';

const getPercorsiData = (data: string) => {
  const [giorno, mese, anno] = data.split('-');
  const giornoNormale = String(Number(giorno));
  const meseNormale = String(Number(mese));
  const giornoPad = giorno.padStart(2, '0');
  const mesePad = mese.padStart(2, '0');

  return Array.from(new Map([
    [`${anno}/${mesePad}/${giornoPad}-${mesePad}-${anno}`, { anno, mese: mesePad, giorno: `${giornoPad}-${mesePad}-${anno}` }],
    [`${anno}/${mesePad}/${giornoNormale}-${meseNormale}-${anno}`, { anno, mese: mesePad, giorno: `${giornoNormale}-${meseNormale}-${anno}` }],
    [`${anno}/${meseNormale}/${giornoNormale}-${meseNormale}-${anno}`, { anno, mese: meseNormale, giorno: `${giornoNormale}-${meseNormale}-${anno}` }],
    [`${anno}/${meseNormale}/${giornoPad}-${mesePad}-${anno}`, { anno, mese: meseNormale, giorno: `${giornoPad}-${mesePad}-${anno}` }],
  ]).values());
};

const getIngressoMs = (ingresso: SocioIngresso['ingresso']) => {
  if (ingresso?.toDate) {
    return ingresso.toDate().getTime();
  }

  return 0;
};

const parseDataIT = (data: string) => {
  const [giorno, mese, anno] = String(data || '').split('-').map(Number);

  if (!giorno || !mese || !anno) {
    return null;
  }

  const dataParsed = new Date(anno, mese - 1, giorno);

  return Number.isNaN(dataParsed.getTime()) ? null : dataParsed;
};

const usaTabFasce = (data: string) => {
  const dataParsed = parseDataIT(data);

  return dataParsed ? [1, 3, 5].includes(dataParsed.getDay()) : false;
};

const getFasciaIngresso = (socio: SocioIngresso): FasciaStorico | null => {
  if (!socio.ingresso?.toDate) {
    return null;
  }

  const dataIngresso = socio.ingresso.toDate();
  const minuti = dataIngresso.getHours() * 60 + dataIngresso.getMinutes();

  if (minuti >= 10 * 60 && minuti <= 14 * 60) {
    return 'mattina';
  }

  if (minuti >= 16 * 60 && minuti <= 23 * 60) {
    return 'pomeriggio';
  }

  return null;
};

const getFasciaDaOra = (): FasciaStorico => {
  const minuti = new Date().getHours() * 60 + new Date().getMinutes();

  return minuti >= 16 * 60 ? 'pomeriggio' : 'mattina';
};

const formattaOrario = (timestamp?: { toDate?: () => Date }) => (
  timestamp?.toDate
    ? timestamp.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : '--:--'
);

const formattaUscita = (socio: SocioIngresso) => (
  socio.uscitaByAdmin ? 'By Admin' : formattaOrario(socio.uscita)
);

export default function SettingsScreen() {

const formattaDataBella = (dataString: string) => {
  if (!dataString) return "";

  const mesi = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  // Dividiamo la stringa 14-04-2026
  const [giorno, mese, anno] = dataString.split('-');
  
  // Trasformiamo il mese in numero e sottraiamo 1 (perché l'array parte da 0)
  const nomeMese = mesi[parseInt(mese) - 1];

  return `${giorno} ${nomeMese} ${anno}`;
};

  const getOggiFormatoIT = () => {
    const oggi = new Date();
    const giorno = String(oggi.getDate()).padStart(2, '0');
    const mese = String(oggi.getMonth() + 1).padStart(2, '0');
    const anno = oggi.getFullYear();

    return `${giorno}-${mese}-${anno}`;
  };

  const [sociFiltrati, setSociFiltrati] = useState<SocioIngresso[]>([]);
  const [giornoSelezionato, setGiornoSelezionato] = useState(getOggiFormatoIT());
  const [fasciaSelezionata, setFasciaSelezionata] = useState<FasciaStorico>(getFasciaDaOra());
  const ultimoOggi = useRef(giornoSelezionato);
  const mostraTabFasce = usaTabFasce(giornoSelezionato);

  useEffect(() => {
    const aggiornaGiornoSelezionato = () => {
      const nuovoOggi = getOggiFormatoIT();

      if (nuovoOggi !== ultimoOggi.current) {
        setGiornoSelezionato((giornoAttuale) => (
          giornoAttuale === ultimoOggi.current ? nuovoOggi : giornoAttuale
        ));
        ultimoOggi.current = nuovoOggi;
      }
    };

    const timer = setInterval(aggiornaGiornoSelezionato, 60000);

    return () => clearInterval(timer);
  }, []);

  const aggiungiGiorni = (data: string, giorni: number) => {
    const [giorno, mese, anno] = data.split('-').map(Number);
    const nuovaData = new Date(anno, mese - 1, giorno);
    nuovaData.setDate(nuovaData.getDate() + giorni);

    const nuovoGiorno = String(nuovaData.getDate()).padStart(2, '0');
    const nuovoMese = String(nuovaData.getMonth() + 1).padStart(2, '0');
    const nuovoAnno = nuovaData.getFullYear();

    return `${nuovoGiorno}-${nuovoMese}-${nuovoAnno}`;
  };

  useEffect(() => {
    if (usaTabFasce(giornoSelezionato)) {
      setFasciaSelezionata(getFasciaDaOra());
    }
  }, [giornoSelezionato]);

  useEffect(() => {
    const ingressiPerPath = new Map<string, SocioIngresso[]>();

    const aggiornaListaIngressi = () => {
      const listaFiltrata = new Map<string, SocioIngresso>();
      const listaCompleta = Array.from(ingressiPerPath.values())
        .flat()
        .filter((socio) => !usaTabFasce(giornoSelezionato) || getFasciaIngresso(socio) === fasciaSelezionata)
        .sort((a, b) => getIngressoMs(b.ingresso) - getIngressoMs(a.ingresso));

      listaCompleta.forEach((socio) => {
        const chiave = socio.socioId || socio.cardId || socio.id;

        if (!listaFiltrata.has(chiave)) {
          listaFiltrata.set(chiave, socio);
        }
      });

      setSociFiltrati(Array.from(listaFiltrata.values()));
    };

    const unsubscribeList = getPercorsiData(giornoSelezionato).map((percorso) => {
      const pathKey = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
      const ingressiRef = collection(db, 'accessi', percorso.anno, percorso.mese, percorso.giorno, 'ingressi_del_giorno');

      return onSnapshot(ingressiRef, (snapshot) => {
        ingressiPerPath.set(pathKey, snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SocioIngresso[]);
        aggiornaListaIngressi();
      }, (error) => {
        console.error("Errore Query Firestore:", error);
      });
    });

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [giornoSelezionato, fasciaSelezionata]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}> Storico Ingressi</Text>
        <Text style={styles.subtitle}>Chi e entrato il {formattaDataBella(giornoSelezionato)}?</Text>
      </View>

      {/* Controlli Data */}
      <View style={styles.dateControls}>
        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setGiornoSelezionato(aggiungiGiorni(giornoSelezionato, -1))}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>Giorno</Text>
          <Text style={styles.dateValue}>{formattaDataBella(giornoSelezionato)}</Text>
        </View>

        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setGiornoSelezionato(aggiungiGiorni(giornoSelezionato, 1))}
        >
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.todayButton} 
        onPress={() => setGiornoSelezionato(getOggiFormatoIT())}
      >
        <Text style={styles.todayButtonText}>Torna a Oggi</Text>
      </TouchableOpacity>

      {mostraTabFasce && (
        <View style={styles.shiftTabs}>
          <TouchableOpacity
            style={[styles.shiftTab, fasciaSelezionata === 'mattina' && styles.shiftTabActive]}
            onPress={() => setFasciaSelezionata('mattina')}
          >
            <Text style={[styles.shiftTabText, fasciaSelezionata === 'mattina' && styles.shiftTabTextActive]}>Mattina</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shiftTab, fasciaSelezionata === 'pomeriggio' && styles.shiftTabActive]}
            onPress={() => setFasciaSelezionata('pomeriggio')}
          >
            <Text style={[styles.shiftTabText, fasciaSelezionata === 'pomeriggio' && styles.shiftTabTextActive]}>Pomeriggio</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista Dinamica */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {sociFiltrati.length > 0 ? (
          sociFiltrati.map((socio) => (
            <View key={socio.id} style={styles.itemRow}>
              <Ionicons name="person-circle-outline" size={32} color="#64def3" />
              <View style={styles.itemInfo}>
                <Text style={styles.itemText}>{socio.nome} {socio.cognome}</Text>
                <Text style={styles.itemSubtext}>Card: {socio.cardId || '--'}</Text>
              </View>
              <View style={styles.timeBox}>
                <Text style={styles.itemTextTime}>In {formattaOrario(socio.ingresso)}</Text>
                <Text style={styles.itemTextExit}>
                  {socio.uscitaByAdmin ? 'OUT: By Admin' : `Out ${formattaUscita(socio)}`}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={50} color="#6b6467" />
            <Text style={styles.emptyText}>Nessun ingresso registrato</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3a3b3b',
    paddingHorizontal: 20,
  },
  header: {
    marginTop: 60,
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#e7bc83',
  },
  subtitle: {
    color: '#fff',
    opacity: 0.8,
    marginTop: 5,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1b1a1a',
    borderRadius: 15,
    padding: 10,
    marginBottom: 10,
  },
  dateButton: {
    backgroundColor: '#6b6467',
    borderRadius: 8,
    padding: 10,
  },
  dateCenter: {
    alignItems: 'center',
  },
  dateLabel: {
    color: '#929090',
    fontSize: 11,
    fontWeight: '800',
  },
  dateValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  todayButton: {
    alignSelf: 'center',
    backgroundColor: '#2b292a',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 15,
  },
  todayButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  shiftTabs: {
    flexDirection: 'row',
    backgroundColor: '#1b1a1a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  shiftTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  shiftTabActive: {
    backgroundColor: '#e7bc83',
  },
  shiftTabText: {
    color: '#fff',
    fontWeight: '800',
  },
  shiftTabTextActive: {
    color: '#1b1a1a',
  },
  scrollView: {
    flex: 1,
    marginTop: 5,
  },
  itemRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#252833', 
    padding: 15, 
    borderRadius: 15, 
    marginBottom: 12 
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  itemSubtext: {
    color: '#929090',
    fontSize: 12,
  },
  timeBox: {
    alignItems: 'flex-end',
  },
  itemTextTime: { 
    color: '#e7bc83', 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
  itemTextExit: {
    color: '#8ad7a6',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
    opacity: 0.5,
  },
  emptyText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  }
});
