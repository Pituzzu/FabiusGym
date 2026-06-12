import { Ionicons } from '@expo/vector-icons';
import { getDatabase, onValue, ref } from 'firebase/database';
import { collection, doc as firestoreDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View
} from 'react-native';
import { db } from '../config/firebaseConfig';

type SocioView = {
  id?: string;
  nome?: string;
  cognome?: string;
  cardId?: string;
  frequenza?: number;
  calc_frequenza?: number;
  recupero?: number;
  dataScadenza?: string;
  prezzo?: number;
};
type MessaggioAccesso = {
  testo: string;
  tipo: 'attesa' | 'ingresso' | 'uscita';
};

const RESET_VIEW_MS = 10000;

const normalizzaCardId = (cardId: string) => {
  return cardId.trim().replace(/\s/g, '').toUpperCase();
};

const getOggiFormatoIT = () => {
  const oggi = new Date();
  const giorno = String(oggi.getDate()).padStart(2, '0');
  const mese = String(oggi.getMonth() + 1).padStart(2, '0');
  const anno = oggi.getFullYear();

  return `${giorno}-${mese}-${anno}`;
};

const formattaOrario = (timestamp?: { toDate?: () => Date }, fallbackMs?: number | null) => {
  if (timestamp?.toDate) {
    return timestamp.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  if (fallbackMs) {
    return new Date(fallbackMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  return '--:--';
};

const dataToNum = (data: string) => {
  const [giorno, mese, anno] = data.split('-').map(Number);
  return new Date(anno, mese - 1, giorno).getTime();
};

const isMeseScaduto = (dataScadenza?: string) => {
  if (!dataScadenza) {
    return false;
  }

  return dataToNum(getOggiFormatoIT()) > dataToNum(dataScadenza);
};

export default function ViewScreen() {
  const [socio, setSocio] = useState<SocioView | null>(null);
  const [cardNonRegistrata, setCardNonRegistrata] = useState('');
  const [messaggioAccesso, setMessaggioAccesso] = useState<MessaggioAccesso | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeSocio = useRef<(() => void) | null>(null);
  const unsubscribeAccesso = useRef<(() => void) | null>(null);

  const tornaInAttesa = useCallback(() => {
    if (unsubscribeSocio.current) {
      unsubscribeSocio.current();
      unsubscribeSocio.current = null;
    }
    if (unsubscribeAccesso.current) {
      unsubscribeAccesso.current();
      unsubscribeAccesso.current = null;
    }

    setSocio(null);
    setCardNonRegistrata('');
    setMessaggioAccesso(null);
  }, []);

  const programmaResetSchermata = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }

    resetTimer.current = setTimeout(tornaInAttesa, RESET_VIEW_MS);
  }, [tornaInAttesa]);

  const ascoltaAccessoGiornaliero = useCallback((socioId: string) => {
    if (unsubscribeAccesso.current) {
      unsubscribeAccesso.current();
    }

    const oggi = getOggiFormatoIT();
    const [, mese, anno] = oggi.split('-');
    const accessoRef = firestoreDoc(db, 'accessi', anno, mese, oggi, 'ingressi_del_giorno', socioId);

    setMessaggioAccesso({
      testo: 'Card rilevata. Attendo la registrazione...',
      tipo: 'attesa'
    });

    unsubscribeAccesso.current = onSnapshot(accessoRef, (accessoSnap) => {
      if (!accessoSnap.exists()) {
        setMessaggioAccesso({
          testo: 'Card rilevata. Attendo la registrazione...',
          tipo: 'attesa'
        });
        return;
      }

      const dati = accessoSnap.data();
      const uscitaRegistrata = !!(dati.uscita || dati.uscita_ms || dati.stato === 'uscito');

      if (uscitaRegistrata) {
        setMessaggioAccesso({
          testo: `Uscita registrata alle ${formattaOrario(dati.uscita, dati.uscita_ms)}`,
          tipo: 'uscita'
        });
        return;
      }

      setMessaggioAccesso({
        testo: `Ingresso registrato alle ${formattaOrario(dati.ingresso, dati.ingresso_ms)}`,
        tipo: 'ingresso'
      });
    }, (error) => {
      console.error('Errore ascolto accesso:', error);
      setMessaggioAccesso(null);
    });
  }, []);

  const ascoltaSocio = useCallback((socioId: string, cardId: string) => {
    if (unsubscribeSocio.current) {
      unsubscribeSocio.current();
    }

    const socioRef = firestoreDoc(db, 'soci', socioId);

    unsubscribeSocio.current = onSnapshot(socioRef, (socioSnap) => {
      if (!socioSnap.exists()) {
        setSocio(null);
        setCardNonRegistrata(cardId);
        return;
      }

      setCardNonRegistrata('');
      setSocio({
        id: socioSnap.id,
        ...socioSnap.data()
      } as SocioView);
      ascoltaAccessoGiornaliero(socioSnap.id);
    }, (error) => {
      console.error('Errore ascolto socio:', error);
      setSocio(null);
      setCardNonRegistrata(cardId);
      setMessaggioAccesso(null);
    });
  }, [ascoltaAccessoGiornaliero]);

  const fetchUserData = useCallback(async (cardId: string) => {
    try {
      if (unsubscribeAccesso.current) {
        unsubscribeAccesso.current();
        unsubscribeAccesso.current = null;
      }
      setMessaggioAccesso(null);

      const cardIdPulita = cardId.trim();
      const cardIdNormalizzata = normalizzaCardId(cardIdPulita);
      const variantiCardId = Array.from(new Set([
        cardIdPulita,
        cardIdPulita.toUpperCase(),
        cardIdPulita.toLowerCase(),
        cardIdNormalizzata
      ])).filter(Boolean);

      const qSocio = query(collection(db, 'soci'), where('cardId', 'in', variantiCardId));
      const querySnapshot = await getDocs(qSocio);

      if (!querySnapshot.empty) {
        const socioId = querySnapshot.docs[0].id;
        ascoltaSocio(socioId, cardIdPulita);
        programmaResetSchermata();
        return;
      }

      const sociSnapshot = await getDocs(collection(db, 'soci'));
      const socioTrovato = sociSnapshot.docs.find((doc) => {
        const dati = doc.data();
        return normalizzaCardId(String(dati.cardId || '')) === cardIdNormalizzata;
      });

      if (socioTrovato) {
        ascoltaSocio(socioTrovato.id, cardIdPulita);
        programmaResetSchermata();
        return;
      }

      setSocio(null);
      setCardNonRegistrata(cardIdPulita);
      setMessaggioAccesso(null);
      programmaResetSchermata();
    } catch (error) {
      console.error('Errore Firestore:', error);
      setSocio(null);
      setCardNonRegistrata(cardId);
      setMessaggioAccesso(null);
      programmaResetSchermata();
    }
  }, [ascoltaSocio, programmaResetSchermata]);

  useEffect(() => {
    const dbRT = getDatabase();
    const scanRef = ref(dbRT, 'ultimo_accesso');

    const unsubscribeRT = onValue(scanRef, (snapshot) => {
      const cardId = snapshot.val();
      if (!cardId) return;

      fetchUserData(String(cardId).trim());
    });

    return () => {
      unsubscribeRT();
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      if (unsubscribeSocio.current) {
        unsubscribeSocio.current();
      }
      if (unsubscribeAccesso.current) {
        unsubscribeAccesso.current();
      }
    };
  }, [fetchUserData]);

  const meseScaduto = isMeseScaduto(socio?.dataScadenza);
  const frequenza = socio?.frequenza || 0;
  const ingressiUsati = socio?.calc_frequenza || 0;

  return (
    <LinearGradient colors={['#000000', '#171717', '#323030']} style={styles.container}>
      <View style={styles.innerContainer}>
        {!socio && !cardNonRegistrata && (
          <View style={styles.waitBox}>
            <Ionicons name="card-outline" size={72} color="#64def3" />
            <Text style={styles.title}>Passa la card</Text>
            <Text style={styles.subtitle}>In attesa del prossimo ingresso</Text>
          </View>
        )}

        {cardNonRegistrata && (
          <View style={styles.card}>
            <Ionicons name="alert-circle-outline" size={58} color="#e7bc83" />
            <Text style={styles.title}>Card non registrata</Text>
            <Text style={styles.subtitle}>{cardNonRegistrata}</Text>
          </View>
        )}

        {socio && (
          <View style={styles.card}>
            <Ionicons
              name={meseScaduto ? 'warning-outline' : 'person-circle-outline'}
              size={70}
              color={meseScaduto ? '#e7bc83' : '#64def3'}
            />
            <Text style={styles.name}>{socio.nome} {socio.cognome}</Text>
            <Text style={[styles.status, meseScaduto && styles.statusWarning]}>
              {meseScaduto ? 'Mese scaduto' : messaggioAccesso?.tipo === 'uscita' ? 'Uscita completata' : 'Ingresso in corso'}
            </Text>

            {messaggioAccesso && (
              <View style={[
                styles.messageBox,
                messaggioAccesso.tipo === 'ingresso' && styles.messageEntry,
                messaggioAccesso.tipo === 'uscita' && styles.messageExit
              ]}>
                <Ionicons
                  name={messaggioAccesso.tipo === 'uscita' ? 'log-out-outline' : 'log-in-outline'}
                  size={22}
                  color={messaggioAccesso.tipo === 'uscita' ? '#8ad7a6' : '#64def3'}
                />
                <Text style={styles.messageText}>{messaggioAccesso.testo}</Text>
              </View>
            )}

            <View style={styles.infoGrid}>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Card</Text>
                <Text style={styles.infoValue}>{socio.cardId || '--'}</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Scadenza</Text>
                <Text style={styles.infoValue}>{socio.dataScadenza || '--'}</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Settimana</Text>
                <Text style={styles.infoValue}>{ingressiUsati}/{frequenza}</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Recuperi</Text>
                <Text style={styles.infoValue}>{socio.recupero || 0}</Text>
              </View>
            </View>

            <Text style={styles.footerText}>Tra 10 secondi torna in attesa</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  waitBox: {
    alignItems: 'center'
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1A1C24',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 18,
    textAlign: 'center'
  },
  subtitle: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center'
  },
  name: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center'
  },
  status: {
    color: '#64def3',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6
  },
  statusWarning: {
    color: '#e7bc83'
  },
  messageBox: {
    width: '100%',
    marginTop: 16,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#252833',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  messageEntry: {
    borderLeftWidth: 4,
    borderLeftColor: '#64def3'
  },
  messageExit: {
    borderLeftWidth: 4,
    borderLeftColor: '#8ad7a6'
  },
  messageText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  infoGrid: {
    width: '100%',
    marginTop: 24,
    gap: 10
  },
  infoBox: {
    backgroundColor: '#252833',
    borderRadius: 8,
    padding: 14
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  infoValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4
  },
  footerText: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 18
  }
});
