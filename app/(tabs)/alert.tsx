import { Ionicons } from '@expo/vector-icons';
import { collection, deleteDoc, doc as firestoreDoc, getDocs, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebaseConfig';

type IconName = keyof typeof Ionicons.glyphMap;
type Anomalia = {
  id: string;
  socioKey: string;
  nome: string;
  cognome: string;
  tipo: string;
  descrizione: string;
  dettaglio: string;
  contatore: number;
  scadenza?: string;
};

const getOggiFormatoIT = () => {
  const oggi = new Date();
  const giorno = String(oggi.getDate()).padStart(2, '0');
  const mese = String(oggi.getMonth() + 1).padStart(2, '0');
  const anno = oggi.getFullYear();

  return `${giorno}-${mese}-${anno}`;
};

const dataToNum = (data: string) => {
  const [giorno, mese, anno] = data.split('-').map(Number);
  return new Date(anno, mese - 1, giorno).getTime();
};

const aggiungiGiorni = (data: string, giorni: number) => {
  const [giorno, mese, anno] = data.split('-').map(Number);
  const nuovaData = new Date(anno, mese - 1, giorno);
  nuovaData.setDate(nuovaData.getDate() + giorni);

  const nuovoGiorno = String(nuovaData.getDate()).padStart(2, '0');
  const nuovoMese = String(nuovaData.getMonth() + 1).padStart(2, '0');
  const nuovoAnno = nuovaData.getFullYear();

  return `${nuovoGiorno}-${nuovoMese}-${nuovoAnno}`;
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

const getTestoTipo = (tipo: string) => {
  if (tipo === 'doppio_ingresso') {
    return 'Doppio ingresso';
  }

  if (tipo === 'mese_scaduto') {
    return 'Mese scaduto';
  }

  if (tipo === 'frequenza_settimanale') {
    return 'Frequenza settimanale';
  }

  return 'Anomalia';
};

const getDescrizioneTipo = (tipo: string) => {
  if (tipo === 'Doppio ingresso') {
    return 'Tentativo di secondo ingresso nello stesso giorno';
  }

  if (tipo === 'Frequenza settimanale') {
    return 'Tentativo di ingresso oltre la frequenza settimanale';
  }

  return 'Tentativo di ingresso con mese scaduto';
};

const unisciTesto = (testoAttuale: string, testoNuovo: string) => {
  const valori = testoAttuale ? testoAttuale.split(', ') : [];

  if (!valori.includes(testoNuovo)) {
    valori.push(testoNuovo);
  }

  return valori.join(', ');
};

const raggruppaAnomaliePerSocio = (lista: Anomalia[]) => {
  const anomaliePerSocio = new Map<string, Anomalia>();

  lista.forEach((anomalia) => {
    const chiave = anomalia.socioKey || anomalia.id;
    const anomaliaEsistente = anomaliePerSocio.get(chiave);

    if (!anomaliaEsistente) {
      anomaliePerSocio.set(chiave, anomalia);
      return;
    }

    anomaliePerSocio.set(chiave, {
      ...anomaliaEsistente,
      tipo: unisciTesto(anomaliaEsistente.tipo, anomalia.tipo),
      descrizione: unisciTesto(anomaliaEsistente.descrizione, anomalia.descrizione),
      dettaglio: 'Totale anomalie',
      contatore: anomaliaEsistente.contatore + anomalia.contatore
    });
  });

  return Array.from(anomaliePerSocio.values());
};

export default function TabTwoScreen() {
  const [alertAperto, setAlertAperto] = useState<string | null>(null);
  const [giornoSelezionato, setGiornoSelezionato] = useState(getOggiFormatoIT());
  const ultimoOggi = useRef(giornoSelezionato);
  const [anomalieGiornaliere, setAnomalieGiornaliere] = useState<Anomalia[]>([]);
  const [anomalieMeseNonPagato, setAnomalieMeseNonPagato] = useState<Anomalia[]>([]);
  const [alertInRimozione, setAlertInRimozione] = useState<string | null>(null);
  const [gridStats, setGridStats] = useState([
    { id: 1, label: 'GIORNALIERO', value: 0, icon: 'calendar-outline' as IconName },
    { id: 2, label: 'MESE SCADUTO', value: 0, icon: 'calendar-number-sharp' as IconName },
    { id: 3, label: 'SETTIMANALE', value: 0, icon: 'today-outline' as IconName },
    { id: 4, label: 'RECUPERI', value: 0, icon: 'repeat-outline' as IconName },
  ]);
  const anomalie = raggruppaAnomaliePerSocio([...anomalieGiornaliere, ...anomalieMeseNonPagato]);

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

  useEffect(() => {
    const anomaliePerPath = new Map<string, any[]>();

    const aggiornaListaAnomalie = () => {
      const anomaliePerSocio = new Map<string, Anomalia>();
      let totaleGiornaliero = 0;
      let totaleSettimanale = 0;
      const listaCompleta = Array.from(anomaliePerPath.values()).flat();

      listaCompleta.forEach(({ id, dati }) => {
        const tipo = getTestoTipo(dati.tipo);
        const chiave = `${dati.socioId || dati.cardId || id}-${dati.tipo}`;
        const anomaliaEsistente = anomaliePerSocio.get(chiave);

        totaleGiornaliero += 1;
        if (dati.tipo === 'frequenza_settimanale') {
          totaleSettimanale += 1;
        }

        if (anomaliaEsistente) {
          anomaliePerSocio.set(chiave, {
            ...anomaliaEsistente,
            contatore: anomaliaEsistente.contatore + 1
          });
          return;
        }

        anomaliePerSocio.set(chiave, {
          id: chiave,
          socioKey: String(dati.socioId || dati.cardId || id),
          nome: dati.nome || '',
          cognome: dati.cognome || '',
          tipo,
          descrizione: getDescrizioneTipo(tipo),
          dettaglio: 'Tentativi bloccati',
          contatore: 1
        });
      });

      setAnomalieGiornaliere(Array.from(anomaliePerSocio.values()));
      setGridStats(currentStats =>
        currentStats.map(item => {
          if (item.label === 'GIORNALIERO') {
            return { ...item, value: totaleGiornaliero };
          }
          if (item.label === 'SETTIMANALE') {
            return { ...item, value: totaleSettimanale };
          }
          return item;
        })
      );
    };

    const unsubscribeList = getPercorsiData(giornoSelezionato).map((percorso) => {
      const pathKey = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
      const colRef = collection(db, 'anomalie', percorso.anno, percorso.mese, percorso.giorno, 'eventi');

      return onSnapshot(colRef, (snapshot) => {
        anomaliePerPath.set(pathKey, snapshot.docs.map(doc => ({
          id: doc.id,
          dati: doc.data()
        })));
        aggiornaListaAnomalie();
      }, (error) => {
        console.error("Errore onSnapshot anomalie:", error);
      });
    });

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [giornoSelezionato]);

  useEffect(() => {
    const colRef = collection(db, "soci");

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const oggi = getOggiFormatoIT();
      const nuoveAnomalieMeseNonPagato: Anomalia[] = [];
      let totaleRecuperi = 0;
      let mesiScaduti = 0;

      snapshot.forEach((doc) => {
        const dati = doc.data();
        const meseNonPagato = dati.dataScadenza && dataToNum(oggi) > dataToNum(dati.dataScadenza);

        totaleRecuperi += dati.recupero || 0;

        const alertMeseScadutoRimosso = dati.alert_mese_scaduto_rimosso_scadenza === dati.dataScadenza;

        if (meseNonPagato && !alertMeseScadutoRimosso) {
          mesiScaduti += 1;
          nuoveAnomalieMeseNonPagato.push({
            id: `${doc.id}-mese-non-pagato`,
            socioKey: doc.id,
            nome: dati.nome || '',
            cognome: dati.cognome || '',
            tipo: 'Mese non pagato',
            descrizione: 'Il socio risulta con abbonamento scaduto',
            dettaglio: 'Scadenza',
            contatore: 1,
            scadenza: dati.dataScadenza || ''
          });
        }
      });

      setAnomalieMeseNonPagato(nuoveAnomalieMeseNonPagato);
      setGridStats(currentStats =>
        currentStats.map(item => {
          if (item.label === 'RECUPERI') {
            return { ...item, value: totaleRecuperi };
          }
          if (item.label === 'MESE SCADUTO') {
            return { ...item, value: mesiScaduti };
          }
          return item;
        })
      );
    }, (error) => {
      console.error("Errore onSnapshot soci:", error);
    });

    return () => unsubscribe();
  }, []);

  const rimuoviAlert = async (anomalia: Anomalia) => {
    setAlertInRimozione(anomalia.id);

    try {
      const operazioni: Promise<void>[] = [];

      for (const percorso of getPercorsiData(giornoSelezionato)) {
        const colRef = collection(db, 'anomalie', percorso.anno, percorso.mese, percorso.giorno, 'eventi');
        const snapshot = await getDocs(colRef);

        snapshot.docs.forEach((alertDoc) => {
          const dati = alertDoc.data();
          const socioKey = String(dati.socioId || dati.cardId || alertDoc.id);

          if (socioKey === anomalia.socioKey) {
            operazioni.push(deleteDoc(alertDoc.ref));
          }
        });
      }

      if (anomalia.tipo.includes('Mese non pagato') && anomalia.scadenza) {
        operazioni.push(updateDoc(firestoreDoc(db, 'soci', anomalia.socioKey), {
          alert_mese_scaduto_rimosso_scadenza: anomalia.scadenza
        }));
      }

      await Promise.all(operazioni);
      setAlertAperto(null);
    } catch (error) {
      console.error("Errore rimozione alert:", error);
      Alert.alert("Errore", "Rimozione alert fallita.");
    } finally {
      setAlertInRimozione(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alert</Text>
        <Text style={styles.subtitle}>Qualcosa e andato storto!?</Text>
      </View>

      <View style={styles.dateControls}>
        <TouchableOpacity style={styles.dateButton} onPress={() => setGiornoSelezionato(aggiungiGiorni(giornoSelezionato, -1))}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>Giorno</Text>
          <Text style={styles.dateValue}>{giornoSelezionato}</Text>
        </View>
        <TouchableOpacity style={styles.dateButton} onPress={() => setGiornoSelezionato(aggiungiGiorni(giornoSelezionato, 1))}>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.todayButton} onPress={() => setGiornoSelezionato(getOggiFormatoIT())}>
        <Text style={styles.todayButtonText}>Oggi</Text>
      </TouchableOpacity>

      <View style={styles.gridContainer}>
        {gridStats.map((item) => (
          <View key={item.id} style={styles.cell}>
            <View style={styles.cellBox}>
              <View>
                <Text style={styles.labelGrid}>{item.label}</Text>
                <Text style={styles.valueGrid}>{item.value}</Text>
              </View>
              <Ionicons name={item.icon} size={22} color="#e0acac" />
            </View>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {anomalie.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Nessuna anomalia rilevata.</Text>
          </View>
        ) : (
          anomalie.map((anomalia, index) => {
            const aperto = alertAperto === anomalia.id;

            return (
              <View style={styles.cardContainer} key={anomalia.id}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setAlertAperto(aperto ? null : anomalia.id)}
                  style={[styles.itemRow, aperto && styles.itemRowActive]}
                >
                  <Text style={styles.idText}>{index + 1}</Text>
                  <View style={styles.nameColumn}>
                    <Text style={styles.nameText} numberOfLines={1}>{anomalia.nome} {anomalia.cognome}</Text>
                    <Text style={styles.typeText}>{anomalia.tipo}</Text>
                  </View>
                  <Text style={styles.countText}>{anomalia.contatore}</Text>
                  <Ionicons
                    name={aperto ? "caret-up-circle" : "caret-down-circle-outline"}
                    size={28}
                    color="#e7bc83"
                  />
                </TouchableOpacity>

                {aperto && (
                  <View style={styles.detailsBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>Anomalia</Text>
                      <Text style={styles.detailTime}>{anomalia.descrizione}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailTitle}>{anomalia.dettaglio}</Text>
                      <Text style={styles.detailTime}>{anomalia.contatore}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.removeButton,
                        alertInRimozione === anomalia.id && styles.removeButtonDisabled
                      ]}
                      onPress={() => rimuoviAlert(anomalia)}
                      disabled={alertInRimozione === anomalia.id}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={styles.removeButtonText}>
                        {alertInRimozione === anomalia.id ? 'Rimozione...' : 'Rimuovi alert'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#523143',
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
    backgroundColor: '#3b1622',
    borderRadius: 15,
    padding: 10,
    marginBottom: 10,
  },
  dateButton: {
    backgroundColor: '#814D64',
    borderRadius: 8,
    padding: 10,
  },
  dateCenter: {
    alignItems: 'center',
  },
  dateLabel: {
    color: '#e0acac',
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
    backgroundColor: '#814D64',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 15,
  },
  todayButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  cell: {
    width: '48%',
    marginBottom: 15,
  },
  cellBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#3b1622',
    padding: 15,
    borderRadius: 18,
    minHeight: 80,
  },
  labelGrid: {
    color: '#e0acac',
    fontSize: 10,
    fontWeight: '800',
  },
  valueGrid: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
    marginTop: 10,
  },
  cardContainer: {
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#814D64',
    padding: 15,
    borderRadius: 15,
    zIndex: 2,
  },
  itemRowActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  idText: {
    color: '#c96d75',
    fontSize: 22,
    fontWeight: 'bold',
    width: 30,
  },
  nameColumn: {
    flex: 1,
    marginLeft: 10,
  },
  nameText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  typeText: {
    color: '#e7bc83',
    fontSize: 12,
    marginTop: 2,
  },
  countText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 12,
  },
  emptyBox: {
    backgroundColor: '#814D64',
    padding: 15,
    borderRadius: 15,
  },
  emptyText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  detailsBox: {
    backgroundColor: '#6b3f53',
    padding: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    marginTop: -1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(231, 188, 131, 0.2)',
  },
  detailTitle: {
    color: '#e7bc83',
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailTime: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
    marginLeft: 12,
    textAlign: 'right',
  },
  removeButton: {
    marginTop: 12,
    backgroundColor: '#c96d75',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeButtonDisabled: {
    opacity: 0.6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
