import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { getDatabase, onValue, ref, set } from 'firebase/database';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { db } from '../config/firebaseConfig';

// --- 1. FUNZIONI DI LOGICA (Fuori dal componente HomeScreen) ---

const getOggiFormatoIT = () => {
  const oggi = new Date();
  const giorno = String(oggi.getDate()).padStart(2, '0');
  const mese = String(oggi.getMonth() + 1).padStart(2, '0');
  const anno = oggi.getFullYear();

  return `${giorno}-${mese}-${anno}`;
};

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

const getIngressoMs = (ingresso: any) => {
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

  if (Number.isNaN(dataParsed.getTime())) {
    return null;
  }

  return dataParsed;
};

const inizioSettimana = (data: Date) => {
  const risultato = new Date(data);
  const giornoSettimana = risultato.getDay();
  const differenzaLunedi = giornoSettimana === 0 ? -6 : 1 - giornoSettimana;

  risultato.setHours(0, 0, 0, 0);
  risultato.setDate(risultato.getDate() + differenzaLunedi);

  return risultato;
};

const stessaSettimana = (dataA: string, dataB: string) => {
  const primaData = parseDataIT(dataA);
  const secondaData = parseDataIT(dataB);

  if (!primaData || !secondaData) {
    return false;
  }

  return inizioSettimana(primaData).getTime() === inizioSettimana(secondaData).getTime();
};

const stessaData = (dataA: string, dataB: string) => {
  const primaData = parseDataIT(dataA);
  const secondaData = parseDataIT(dataB);

  if (!primaData || !secondaData) {
    return false;
  }

  primaData.setHours(0, 0, 0, 0);
  secondaData.setHours(0, 0, 0, 0);

  return primaData.getTime() === secondaData.getTime();
};

const DUPLICATE_SCAN_WINDOW_MS = 1500;
const CARD_RESET_RECUPERI = 'C34F8E0D';
const GIORNI_APERTURA_SETTIMANALI = 5;
const VENERDI = 5;
const isCardResetRecuperi = (cardId: string) => cardId.trim().toUpperCase() === CARD_RESET_RECUPERI;
type TipoNotifica = 'success' | 'warning' | 'error';
type NotificaAccesso = {
  titolo: string;
  messaggio: string;
  tipo: TipoNotifica;
};

const toNumeroSicuro = (valore: unknown) => {
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : 0;
};

const calcolaFrequenzaConRecuperiLimitati = (frequenza: unknown, recupero: unknown) => {
  const frequenzaSettimanale = toNumeroSicuro(frequenza);
  const recuperoGg = toNumeroSicuro(recupero);
  const frequenzaBase = Math.min(
    Math.max(frequenzaSettimanale - recuperoGg, 0),
    GIORNI_APERTURA_SETTIMANALI
  );
  const recuperoMassimo = Math.max(GIORNI_APERTURA_SETTIMANALI - frequenzaBase, 0);
  const recuperoLimitato = Math.min(Math.max(recuperoGg, 0), recuperoMassimo);

  return {
    frequenzaBase,
    recuperoMassimo,
    recuperoLimitato,
    frequenzaTotale: frequenzaBase + recuperoLimitato
  };
};

const eseguiResetRecuperiSettimanali = async () => {
  const oggi = getOggiFormatoIT();
  const giornoSettimana = new Date().getDay(); // 0 (Dom) - 6 (Sab)

  if (giornoSettimana !== VENERDI) {
    throw "RESET_NOT_FRIDAY";
  }

  const sociSnapshot = await getDocs(collection(db, "soci"));
  let batch = writeBatch(db);
  let operazioniBatch = 0;
  let sociAggiornati = 0;
  let sociGiaAggiornati = 0;
  let sociMeseScaduto = 0;

  const dataToNum = (dStr: string) => {
    const [g, m, a] = dStr.split('-').map(Number);
    return new Date(a, m - 1, g).getTime();
  };

  for (const socioDoc of sociSnapshot.docs) {
    const dati = socioDoc.data();
    const meseScaduto = dati.dataScadenza && dataToNum(oggi) > dataToNum(dati.dataScadenza);

    if (meseScaduto) {
      sociMeseScaduto += 1;
    }

    if (dati.ultimo_reset_recuperi === oggi) {
      sociGiaAggiornati += 1;
      continue;
    }

    const calcolo_frequenza = toNumeroSicuro(dati.calc_frequenza);
    const frequenza_settimanale = dati.frequenza || 0;
    const recupero_gg = dati.recupero || 0;
    const { frequenzaBase, recuperoMassimo } = calcolaFrequenzaConRecuperiLimitati(frequenza_settimanale, recupero_gg);
    const recuperoDaAttribuire = Math.min(
      Math.max(frequenzaBase - calcolo_frequenza, 0),
      recuperoMassimo
    );

    batch.update(socioDoc.ref, {
      calc_frequenza: 0,
      frequenza: frequenzaBase + recuperoDaAttribuire,
      recupero: recuperoDaAttribuire,
      ultimo_reset_recuperi: oggi
    });

    operazioniBatch += 1;
    sociAggiornati += 1;

    if (operazioniBatch === 450) {
      await batch.commit();
      batch = writeBatch(db);
      operazioniBatch = 0;
    }
  }

  if (operazioniBatch > 0) {
    await batch.commit();
  }

  return { sociAggiornati, sociGiaAggiornati, sociMeseScaduto };
};

const registraIngressoSocio = async (cardId: string, scanTime: number = Date.now()) => {
  const cardIdPulita = cardId.trim();
  const oggi = getOggiFormatoIT();
  const dataRef = new Date();
  const anno = String(dataRef.getFullYear());
  const mese = String(dataRef.getMonth() + 1).padStart(2, '0');

  const qSocio = query(collection(db, "soci"), where("cardId", "==", cardIdPulita));
  const querySnapshot = await getDocs(qSocio);
  if (querySnapshot.empty) throw "USER_NOT_FOUND";

  const socioDoc = querySnapshot.docs[0];
  const socioId = socioDoc.id;
  const socioData = socioDoc.data();
  const socioDocRef = doc(db, "soci", socioId);
  const ingressiOggiRef = collection(db, 'accessi', anno, mese, oggi, 'ingressi_del_giorno');
  const ingressoDocRef = doc(ingressiOggiRef, socioId);
  const ingressoGiaInStorico = !(await getDocs(query(ingressiOggiRef, where("socioId", "==", socioId)))).empty;
  let erroreAccesso: string | null = null;

  await runTransaction(db, async (transaction) => {
    const snapSocio = await transaction.get(socioDocRef);
    if (!snapSocio.exists()) throw "USER_NOT_FOUND";
    const snapIngressoOggi = await transaction.get(ingressoDocRef);

    const dati = snapSocio.data();
    const dataUltimoAccesso = dati.ultimo_giorno_accesso || "";
    let ingressiOggi = dati.doppio_ingresso || 0;
    const ultimoIngressoMs = dati.ultimo_ingresso_ms || 0;
    let calcolo_frequenza = dati.calc_frequenza || 0;
    let frequenza_settimanale = dati.frequenza || 0;
    let recupero_gg = dati.recupero || 0;
    let scadenza = dati.dataScadenza; // formato "GG-MM-AAAA"

    if (!stessaSettimana(dataUltimoAccesso, oggi)) {
      calcolo_frequenza = 0;
    }

    const ultimoAccessoOggi = stessaData(dataUltimoAccesso, oggi);

    if (!ultimoAccessoOggi) {
      ingressiOggi = 0;
    }

    const ingressoGiaRegistratoOggi = snapIngressoOggi.exists() || ingressoGiaInStorico;
    const profiloSegnaIngressoOggi = ingressiOggi >= 1 && ultimoAccessoOggi;
    const stessoPassaggioGiaProcessato = ultimoAccessoOggi &&
      ultimoIngressoMs &&
      Math.abs(scanTime - ultimoIngressoMs) < DUPLICATE_SCAN_WINDOW_MS;

    if (ingressoGiaRegistratoOggi || profiloSegnaIngressoOggi) {
      if (stessoPassaggioGiaProcessato) {
        throw "DUPLICATE_SCAN";
      }

      const anomaliaDocRef = doc(collection(db, 'anomalie', anno, mese, oggi, 'eventi'));

      if (!ingressoGiaRegistratoOggi && profiloSegnaIngressoOggi) {
        transaction.set(ingressoDocRef, {
          nome: socioData.nome,
          cognome: socioData.cognome,
          cardId: cardIdPulita,
          ingresso: serverTimestamp(),
          socioId: socioId,
          ripristinato: true
        });
      }

      transaction.update(socioDocRef, {
        doppio_ingresso: Math.max(ingressiOggi, 1),
        anomalia_doppio_ingresso: (dati.anomalia_doppio_ingresso || 0) + 1,
        data_anomalia_doppio_ingresso: oggi,
        ultimo_tentativo_doppio_ingresso_ms: scanTime
      });

      transaction.set(anomaliaDocRef, {
        tipo: 'doppio_ingresso',
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp()
      });

      erroreAccesso = "ALREADY_IN";
      return;
    }

    // --- HELPER PER CONFRONTO DATE ---
    const dataToNum = (dStr: string) => {
      const [g, m, a] = dStr.split('-').map(Number);
      return new Date(a, m - 1, g).getTime();
    };

    // --- 1° CONDIZIONE: Scadenza Mese ---
    if (dataToNum(oggi) > dataToNum(scadenza)) {
      if (!ultimoAccessoOggi) {
        ingressiOggi = 0;
      }

      const { frequenzaBase } = calcolaFrequenzaConRecuperiLimitati(frequenza_settimanale, recupero_gg);
      const anomaliaDocRef = doc(collection(db, 'anomalie', anno, mese, oggi, 'eventi'));
      transaction.set(ingressoDocRef, {
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        ingresso: serverTimestamp(),
        socioId: socioId
      });

      transaction.update(socioDocRef, {
        doppio_ingresso: ingressiOggi + 1,
        ultimo_giorno_accesso: oggi,
        ultimo_ingresso_ms: scanTime,
        calc_frequenza: 1,
        frequenza: frequenzaBase,
        recupero: 0,
        anomalia_mese_scaduto: (dati.anomalia_mese_scaduto || 0) + 1,
        data_anomalia_mese_scaduto: oggi,
        ultimo_tentativo_mese_scaduto_ms: scanTime
      });

      transaction.set(anomaliaDocRef, {
        tipo: 'mese_scaduto',
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp()
      });

      erroreAccesso = "Mese scaduto";
      return;
    }

    // --- 2° CONDIZIONE: Blocco Doppioni ---
    if (!ultimoAccessoOggi) {
      ingressiOggi = 0;
    }
    if (ingressiOggi >= 1 && ultimoAccessoOggi) {
      if (stessoPassaggioGiaProcessato) {
        throw "DUPLICATE_SCAN";
      }

      const anomaliaDocRef = doc(collection(db, 'anomalie', anno, mese, oggi, 'eventi'));

      transaction.update(socioDocRef, {
        anomalia_doppio_ingresso: (dati.anomalia_doppio_ingresso || 0) + 1,
        data_anomalia_doppio_ingresso: oggi,
        ultimo_tentativo_doppio_ingresso_ms: scanTime
      });

      transaction.set(anomaliaDocRef, {
        tipo: 'doppio_ingresso',
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp()
      });

      erroreAccesso = "ALREADY_IN";
      return;
    }
    const incrementaFrequenza = ingressiOggi === 0;

    // --- BLOCCO FREQUENZA MASSIMA ---
    if (incrementaFrequenza && calcolo_frequenza >= frequenza_settimanale) {
      const anomaliaDocRef = doc(collection(db, 'anomalie', anno, mese, oggi, 'eventi'));

      transaction.update(socioDocRef, {
        anomalia_frequenza_settimanale: (dati.anomalia_frequenza_settimanale || 0) + 1,
        data_anomalia_frequenza_settimanale: oggi,
        ultimo_tentativo_frequenza_settimanale_ms: scanTime
      });

      transaction.set(anomaliaDocRef, {
        tipo: 'frequenza_settimanale',
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp()
      });

      erroreAccesso = "FREQUENCY_EXCEEDED";
      return;
    }
    const nuovoCalcoloFrequenza = incrementaFrequenza ? calcolo_frequenza + 1 : calcolo_frequenza;

    // Registrazione fisica ingresso
    transaction.set(ingressoDocRef, {
      nome: socioData.nome,
      cognome: socioData.cognome,
      cardId: cardIdPulita,
      ingresso: serverTimestamp(),
      socioId: socioId
    });

    // Aggiornamento contatore socio
    transaction.update(socioDocRef, {
      doppio_ingresso: ingressiOggi + 1,
      ultimo_giorno_accesso: oggi,
      ultimo_ingresso_ms: scanTime,
      calc_frequenza: nuovoCalcoloFrequenza,
      frequenza: frequenza_settimanale,
      recupero: recupero_gg
    });
  });

  if (erroreAccesso) throw erroreAccesso;

  return socioData;
};

// --- 2. COMPONENTE PRINCIPALE ---

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const [numeroIscritti, setNumeroIscritti] = useState(0);
  const [ingressiOggi, setIngressiOggi] = useState<any[]>([]);
  const [notificaAccesso, setNotificaAccesso] = useState<NotificaAccesso | null>(null);
  const [giornoCorrente, setGiornoCorrente] = useState(getOggiFormatoIT());
  const lastProcessedScan = useRef({ cardId: '', time: 0 });
  const notificaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostraNotifica = useCallback((titolo: string, messaggio: string, tipo: TipoNotifica) => {
    if (notificaTimer.current) {
      clearTimeout(notificaTimer.current);
    }

    setNotificaAccesso({ titolo, messaggio, tipo });
    notificaTimer.current = setTimeout(() => {
      setNotificaAccesso(null);
      notificaTimer.current = null;
    }, 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (notificaTimer.current) {
        clearTimeout(notificaTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const aggiornaGiornoCorrente = () => {
      setGiornoCorrente(getOggiFormatoIT());
    };

    aggiornaGiornoCorrente();
    const timer = setInterval(aggiornaGiornoCorrente, 60000);

    return () => clearInterval(timer);
  }, []);

  // Listener Iscritti Totali
  useEffect(() => {
    return onSnapshot(collection(db, 'soci'), (snap) => setNumeroIscritti(snap.size));
  }, []);

  // Listener Ingressi del Giorno (Lista)
  // Listener Ingressi del Giorno con FILTRO DOPPIONI
  useEffect(() => {
    const ingressiPerPath = new Map<string, any[]>();
    const aggiornaListaIngressi = () => {

    // Ordiniamo per orario decrescente (il più recente in alto)

      const listaCompleta = Array.from(ingressiPerPath.values())
        .flat()
        .sort((a, b) => getIngressoMs(b.ingresso) - getIngressoMs(a.ingresso));
      const listaFiltrata = new Map();

      listaCompleta.forEach((dati) => {
        const idSocio = dati.socioId;

        if (isCardResetRecuperi(String(dati.cardId || ''))) {
          return;
        }

        // Se il socio non è ancora nella mappa, lo aggiungiamo.
        // Essendo la query ordinata per 'desc', il primo che troviamo è il più recente.
        if (!listaFiltrata.has(idSocio)) {
          listaFiltrata.set(idSocio, dati);
        }
      });

      // Trasformiamo la mappa di nuovo in un array per lo stato
      setIngressiOggi(Array.from(listaFiltrata.values()));
    };

    const unsubscribeList = getPercorsiData(giornoCorrente).map((percorso) => {
      const pathKey = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
      const path = collection(db, 'accessi', percorso.anno, percorso.mese, percorso.giorno, 'ingressi_del_giorno');

      return onSnapshot(path, (snapshot) => {
        ingressiPerPath.set(pathKey, snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
        aggiornaListaIngressi();
      }, (error) => {
        console.error("Errore onSnapshot ingressi:", error);
      });
    });

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [giornoCorrente]);

  // Listener Scanner (Realtime Database)
  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const dbRT = getDatabase();
    const scanRef = ref(dbRT, 'ultimo_accesso');

    return onValue(scanRef, async (snapshot) => {
      const cardId = snapshot.val();
      const ora = Date.now();
      const cardIdPulita = String(cardId || '').trim();

      if (!cardIdPulita) return;
      if (
        lastProcessedScan.current.cardId === cardIdPulita &&
        ora - lastProcessedScan.current.time < DUPLICATE_SCAN_WINDOW_MS
      ) return;
      lastProcessedScan.current = { cardId: cardIdPulita, time: ora };

      try {
        await set(scanRef, null); // Reset immediato scanner
        if (isCardResetRecuperi(cardIdPulita)) {
          const risultato = await eseguiResetRecuperiSettimanali();
          mostraNotifica(
            "Reset completato",
            `Soci aggiornati: ${risultato.sociAggiornati}. Gia aggiornati oggi: ${risultato.sociGiaAggiornati}. Mesi scaduti rilevati: ${risultato.sociMeseScaduto}.`,
            "success"
          );
          return;
        }

        const socio = await registraIngressoSocio(cardIdPulita, ora);
        mostraNotifica("Benvenuto", `${socio.nome} ${socio.cognome}`, "success");
      } catch (error) {
        if (error === "DUPLICATE_SCAN") {
          return;
        } else if (error === "ALREADY_IN") {
          mostraNotifica("Doppio ingresso", "Socio gia entrato oggi.", "error");
        } else if (error === "USER_NOT_FOUND") {
          mostraNotifica("Tessera non registrata", cardIdPulita, "warning");
        } else if (error === "FREQUENCY_EXCEEDED") {
          mostraNotifica("Accesso negato", "Frequenza settimanale superata.", "error");
        } else if (error === "Mese scaduto") {
          mostraNotifica("Mese scaduto", "Ingresso registrato. Sistemare il pagamento.", "warning");

        } else if (error === "RESET_NOT_FRIDAY") {
          mostraNotifica("Reset non disponibile", "La card di reset funziona solo il venerdi.", "warning");
        } else {
          console.error("Errore:", error);
          mostraNotifica("Errore", "Ingresso non registrato.", "error");
        }
      }
    });
  }, [isFocused, mostraNotifica]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.text}>GymFabius 💪</Text>
        <Text style={styles.textSub}>Gestione Ingressi</Text>
      </View>

      {notificaAccesso && (
        <View style={[
          styles.notice,
          notificaAccesso.tipo === 'success' && styles.noticeSuccess,
          notificaAccesso.tipo === 'warning' && styles.noticeWarning,
          notificaAccesso.tipo === 'error' && styles.noticeError
        ]}>
          <Text style={styles.noticeTitle}>{notificaAccesso.titolo}</Text>
          <Text style={styles.noticeText}>{notificaAccesso.messaggio}</Text>
        </View>
      )}

      <View style={styles.infoContainer}>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>PRESENTI {"\n"} {ingressiOggi.length}</Text>
          <Ionicons name="log-in-outline" size={30} color={'#459E7B'} />
        </View>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>ISCRITTI {"\n"} {numeroIscritti}</Text>
          <Ionicons name="people-outline" size={30} color={'#A77BFF'} />
        </View>
      </View>

      <View style={styles.listWrapper}>
        <View style={styles.headerLista}>
          <Ionicons name="timer-outline" size={24} color="#5CB4EA" />
          <Text style={styles.listTitle}>Ingressi Giornalieri</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {ingressiOggi.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Ionicons name="person-circle-outline" size={24} color="#64def3" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.itemText}>{item.nome} {item.cognome}</Text>
              </View>
              <Text style={styles.itemTextTime}>
                {item.ingresso?.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// --- 3. STILI ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101010', alignItems: 'center', paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 30 },
  text: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  textSub: { fontSize: 16, color: '#aaa', marginTop: 5 },
  notice: { width: '92%', borderLeftWidth: 4, borderRadius: 8, padding: 14, marginBottom: 16 },
  noticeSuccess: { backgroundColor: '#163328', borderLeftColor: '#459E7B' },
  noticeWarning: { backgroundColor: '#352a19', borderLeftColor: '#e7bc83' },
  noticeError: { backgroundColor: '#3a1d24', borderLeftColor: '#ff5c7a' },
  noticeTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  noticeText: { color: '#ddd', fontSize: 14 },
  infoContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 15 },
  blocco: { flexDirection: 'row', backgroundColor: '#1A1C24', justifyContent: 'space-between', alignItems: 'center', width: '46%', padding: 20, borderRadius: 20 },
  textinfo: { color: '#fff', fontSize: 16, fontWeight: 'bold', lineHeight: 22 },
  listWrapper: { flex: 1, width: '92%', backgroundColor: '#1A1C24', marginTop: 40, borderRadius: 25, padding: 20, marginBottom: 20 },
  headerLista: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  listTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252833', padding: 15, borderRadius: 15, marginBottom: 12 },
  itemText: { color: '#fff', fontSize: 16 },
  itemTextTime: { color: '#aaa', fontSize: 14 },
});
