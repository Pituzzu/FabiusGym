import { Ionicons } from "@expo/vector-icons";
import { getDatabase, onValue, ref, set } from "firebase/database";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../config/firebaseConfig";

const CARD_RESET_RECUPERI = "C34F8E0D";
const isCardAdmin = (cardId: string) =>
  cardId.trim().toUpperCase() === CARD_RESET_RECUPERI;
type AccessoProfilo = {
  id: string;
  data: string;
  ingresso?: {
    toDate?: () => Date;
  };
  uscita?: {
    toDate?: () => Date;
  };
  ingresso_ms?: number;
  uscita_ms?: number | null;
  stato?: string;
  manuale?: boolean;
  uscitaManuale?: boolean;
};

const normalizzaOrdinamento = (valore: unknown) =>
  String(valore || "")
    .trim()
    .toLocaleLowerCase("it");

const ordinaSociPerCognome = (lista: any[]) =>
  [...lista].sort((a, b) => {
    const confrontoCognome = normalizzaOrdinamento(a.cognome).localeCompare(
      normalizzaOrdinamento(b.cognome),
      "it",
      { sensitivity: "base" },
    );

    if (confrontoCognome !== 0) {
      return confrontoCognome;
    }

    return normalizzaOrdinamento(a.nome).localeCompare(
      normalizzaOrdinamento(b.nome),
      "it",
      { sensitivity: "base" },
    );
  });

const formattaOrario = (
  timestamp?: { toDate?: () => Date },
  fallbackMs?: number | null,
) => {
  if (timestamp?.toDate) {
    return timestamp
      .toDate()
      .toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  if (fallbackMs) {
    return new Date(fallbackMs).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return "--:--";
};

const getTimestampMs = (
  timestamp?: { toDate?: () => Date },
  fallbackMs?: number | null,
) => {
  if (timestamp?.toDate) {
    return timestamp.toDate().getTime();
  }

  return fallbackMs || 0;
};

const formattaDataDaDate = (data: Date) => {
  const giorno = String(data.getDate()).padStart(2, "0");
  const mese = String(data.getMonth() + 1).padStart(2, "0");
  const anno = data.getFullYear();

  return `${giorno}-${mese}-${anno}`;
};

const normalizzaDataIT = (data: string) => {
  const [giorno, mese, anno] = String(data || "")
    .split("-")
    .map(Number);

  if (!giorno || !mese || !anno) {
    return "";
  }

  return `${String(giorno).padStart(2, "0")}-${String(mese).padStart(2, "0")}-${anno}`;
};

const formattaMeseAnno = (data: Date) =>
  data.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

const getPercorsiData = (data: string) => {
  const [giorno, mese, anno] = data.split("-");
  const giornoNormale = String(Number(giorno));
  const meseNormale = String(Number(mese));
  const giornoPad = giorno.padStart(2, "0");
  const mesePad = mese.padStart(2, "0");

  return Array.from(
    new Map([
      [
        `${anno}/${mesePad}/${giornoPad}-${mesePad}-${anno}`,
        { anno, mese: mesePad, giorno: `${giornoPad}-${mesePad}-${anno}` },
      ],
      [
        `${anno}/${mesePad}/${giornoNormale}-${meseNormale}-${anno}`,
        {
          anno,
          mese: mesePad,
          giorno: `${giornoNormale}-${meseNormale}-${anno}`,
        },
      ],
      [
        `${anno}/${meseNormale}/${giornoNormale}-${meseNormale}-${anno}`,
        {
          anno,
          mese: meseNormale,
          giorno: `${giornoNormale}-${meseNormale}-${anno}`,
        },
      ],
      [
        `${anno}/${meseNormale}/${giornoPad}-${mesePad}-${anno}`,
        { anno, mese: meseNormale, giorno: `${giornoPad}-${mesePad}-${anno}` },
      ],
    ]).values(),
  );
};

export default function Iscritti() {
  const [iscrizione, setIscrizione] = useState(false);
  const [modifica_iscritto, setModificaIscritto] = useState(false);
  const [profilo_visibile, setProfiloVisibile] = useState(false);
  const [conferma_eliminazione, setConfermaEliminazione] = useState(false);
  const [infoIscritto, setInfoIscritto] = useState<any>(null);
  const [valore, setValore] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [cardId, setCardId] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [loading, setLoading] = useState(false);

  // STATI PER LA RICERCA E LISTA
  const [tuttiSoci, setTuttiSoci] = useState<any[]>([]); // Fonte dati originale
  const [sociFiltrati, setSociFiltrati] = useState<any[]>([]); // Dati visualizzati (filtrati)
  const [searchQuery, setSearchQuery] = useState("");
  const [socioSelezionato, setSocioSelezionato] = useState("");
  const [accessiProfilo, setAccessiProfilo] = useState<
    Record<string, AccessoProfilo>
  >({});
  const [caricamentoProfilo, setCaricamentoProfilo] = useState(false);
  const [dataProfilo, setDataProfilo] = useState(() => {
    const oggi = new Date();
    const giorno = String(oggi.getDate()).padStart(2, "0");
    const mese = String(oggi.getMonth() + 1).padStart(2, "0");
    const anno = oggi.getFullYear();

    return `${giorno}-${mese}-${anno}`;
  });
  const [meseProfilo, setMeseProfilo] = useState(() => {
    const oggi = new Date();
    oggi.setDate(1);
    oggi.setHours(0, 0, 0, 0);

    return oggi;
  });
  const unsubscribeInfoIscritto = useRef<(() => void) | null>(null);

  // 1. Definisci lo stato così per non avere problemi di tipi
  const estrai_info_socio = (socioId: any) => {
    if (!socioId) return;

    if (unsubscribeInfoIscritto.current) {
      unsubscribeInfoIscritto.current();
    }

    const docRef = doc(db, "soci", socioId);

    unsubscribeInfoIscritto.current = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const dati = snap.data();
          setInfoIscritto(dati); // SALVIAMO I DATI NELLO STATO
        } else {
          setInfoIscritto(null);
        }
      },
      (error) => {
        console.error("Errore:", error);
        setInfoIscritto(null);
      },
    );
  };

  useEffect(() => {
    if (!modifica_iscritto && unsubscribeInfoIscritto.current) {
      unsubscribeInfoIscritto.current();
      unsubscribeInfoIscritto.current = null;
      setInfoIscritto(null);
    }
  }, [modifica_iscritto]);

  useEffect(() => {
    return () => {
      if (unsubscribeInfoIscritto.current) {
        unsubscribeInfoIscritto.current();
      }
    };
  }, []);

  // 1. UNICA QUERY FIRESTORE PER LA LISTA
  useEffect(() => {
    // Ordiniamo per cognome per una lista più leggibile
    const q = query(collection(db, "soci"), orderBy("cognome", "asc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const dati = ordinaSociPerCognome(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      );
      setTuttiSoci(dati);

      // Se non sto cercando nulla, aggiorna anche la lista filtrata
      if (searchQuery.trim() === "") {
        setSociFiltrati(dati);
      }
    });
    return () => unsub();
  }, [searchQuery]);

  useEffect(() => {
    let annullato = false;

    const caricaAccessiProfilo = async () => {
      if (!profilo_visibile || !socioSelezionato) {
        setAccessiProfilo({});
        setCaricamentoProfilo(false);
        return;
      }

      setCaricamentoProfilo(true);
      const anno = meseProfilo.getFullYear();
      const mese = meseProfilo.getMonth();
      const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
      const percorsiDaLeggere = new Map<
        string,
        { data: string; anno: string; mese: string; giorno: string }
      >();

      for (let giorno = 1; giorno <= giorniNelMese; giorno += 1) {
        const data = formattaDataDaDate(new Date(anno, mese, giorno));

        getPercorsiData(data).forEach((percorso) => {
          const chiave = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
          percorsiDaLeggere.set(chiave, { data, ...percorso });
        });
      }

      try {
        const risultati = await Promise.all(
          Array.from(percorsiDaLeggere.values()).map(async (percorso) => {
            const ingressiRef = collection(
              db,
              "accessi",
              percorso.anno,
              percorso.mese,
              percorso.giorno,
              "ingressi_del_giorno",
            );
            const ingressoDirettoRef = doc(ingressiRef, socioSelezionato);
            const [ingressoDiretto, ingressiSocioSnapshot] = await Promise.all([
              getDoc(ingressoDirettoRef),
              getDocs(
                query(ingressiRef, where("socioId", "==", socioSelezionato)),
              ),
            ]);
            const accessiTrovati = new Map<string, AccessoProfilo>();

            if (ingressoDiretto.exists()) {
              accessiTrovati.set(ingressoDiretto.ref.path, {
                id: ingressoDiretto.id,
                data: percorso.data,
                ...(ingressoDiretto.data() as Omit<
                  AccessoProfilo,
                  "id" | "data"
                >),
              });
            }

            ingressiSocioSnapshot.docs.forEach((accessoDoc) => {
              accessiTrovati.set(accessoDoc.ref.path, {
                id: accessoDoc.id,
                data: percorso.data,
                ...(accessoDoc.data() as Omit<AccessoProfilo, "id" | "data">),
              });
            });

            return Array.from(accessiTrovati.values());
          }),
        );

        if (annullato) {
          return;
        }

        const prossimiAccessi: Record<string, AccessoProfilo> = {};

        risultati.flat().forEach((accessoCorrente) => {
          const dataNormalizzata =
            normalizzaDataIT(accessoCorrente.data) ||
            (accessoCorrente.ingresso?.toDate
              ? formattaDataDaDate(accessoCorrente.ingresso.toDate())
              : "");

          if (!dataNormalizzata) {
            return;
          }

          const accessoEsistente = prossimiAccessi[dataNormalizzata];

          if (
            !accessoEsistente ||
            getTimestampMs(
              accessoCorrente.ingresso,
              accessoCorrente.ingresso_ms,
            ) >
              getTimestampMs(
                accessoEsistente.ingresso,
                accessoEsistente.ingresso_ms,
              )
          ) {
            prossimiAccessi[dataNormalizzata] = {
              ...accessoCorrente,
              data: dataNormalizzata,
            };
          }
        });

        setAccessiProfilo(prossimiAccessi);
      } catch (error) {
        console.error("Errore storico profilo socio:", error);

        if (!annullato) {
          setAccessiProfilo({});
        }
      } finally {
        if (!annullato) {
          setCaricamentoProfilo(false);
        }
      }
    };

    caricaAccessiProfilo();

    return () => {
      annullato = true;
    };
  }, [profilo_visibile, socioSelezionato, meseProfilo]);

  // 2. FUNZIONE DI RICERCA REAL-TIME
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.trim() === "") {
      setSociFiltrati(tuttiSoci);
      return;
    }

    const queryLowerCase = text.toLowerCase();
    const filtrati = tuttiSoci.filter((socio) => {
      const nomeCompleto = `${socio.nome} ${socio.cognome}`.toLowerCase();
      const cardIdSocio = socio.cardId ? socio.cardId.toLowerCase() : "";
      return (
        nomeCompleto.includes(queryLowerCase) ||
        cardIdSocio.includes(queryLowerCase)
      );
    });
    setSociFiltrati(ordinaSociPerCognome(filtrati));
  };

  // 3. ASCOLTO SCANNER ESP32 (Solo se il modal è aperto)
  useEffect(() => {
    if (!iscrizione && !modifica_iscritto) {
      return;
    }

    const dbRT = getDatabase();
    const scanRef = ref(dbRT, "ultimo_accesso");

    const unsubScan = onValue(scanRef, async (snapshot) => {
      const cardIdRilevato = snapshot.val();
      if (cardIdRilevato) {
        setCardId(String(cardIdRilevato).trim());
        await set(scanRef, null);
      }
    });
    return () => unsubScan();
  }, [iscrizione, modifica_iscritto]);

  // FUNZIONI DI SUPPORTO
  const Calcolo_Scadenza = () => {
    const oggi = new Date();
    const scadenza = new Date(oggi);

    // Aggiungiamo i 30 giorni
    scadenza.setDate(oggi.getDate() + 30);

    // Estraiamo i pezzi
    const gg = String(scadenza.getDate()).padStart(2, "0");
    const mm = String(scadenza.getMonth() + 1).padStart(2, "0"); // +1 perché i mesi partono da 0
    const aaaa = scadenza.getFullYear();

    // Ritorniamo la stringa formattata
    return `${gg}-${mm}-${aaaa}`;
  };

  const getOggiFormatoIT = () => {
    const oggi = new Date();
    const giorno = String(oggi.getDate()).padStart(2, "0");
    const mese = String(oggi.getMonth() + 1).padStart(2, "0");
    const anno = oggi.getFullYear();

    return `${giorno}-${mese}-${anno}`;
  };

  const parseDataIT = (data: string) => {
    const [giorno, mese, anno] = String(data || "")
      .split("-")
      .map(Number);

    if (!giorno || !mese || !anno) {
      return null;
    }

    const dataParsed = new Date(anno, mese - 1, giorno);

    if (Number.isNaN(dataParsed.getTime())) {
      return null;
    }

    return dataParsed;
  };

  const formattaDataIT = (data: Date) => {
    const giorno = String(data.getDate()).padStart(2, "0");
    const mese = String(data.getMonth() + 1).padStart(2, "0");
    const anno = data.getFullYear();

    return `${giorno}-${mese}-${anno}`;
  };

  const normalizzaDataScadenza = (data: string) => {
    const dataParsed = parseDataIT(data);

    if (!dataParsed) {
      return "";
    }

    return formattaDataIT(dataParsed);
  };

  const aggiungiGiorni = (data: Date, giorni: number) => {
    const nuovaData = new Date(data);
    nuovaData.setDate(nuovaData.getDate() + giorni);

    return nuovaData;
  };

  const Calcolo_Rinnovo_Mese = () => {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const scadenzaAttuale = parseDataIT(dataScadenza);
    const base =
      scadenzaAttuale && scadenzaAttuale.getTime() > oggi.getTime()
        ? scadenzaAttuale
        : oggi;

    return formattaDataIT(aggiungiGiorni(base, 30));
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

    return (
      inizioSettimana(primaData).getTime() ===
      inizioSettimana(secondaData).getTime()
    );
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

  const dataToNum = (data: string) => {
    const dataParsed = parseDataIT(data);

    return dataParsed ? dataParsed.getTime() : 0;
  };

  const apriscritto = () => {
    setNome("");
    setCognome("");
    setCardId("");
    setValore("");
    setPrezzo("");
    setIscrizione(true);
  };

  const apriModifica = (socio: any) => {
    setSocioSelezionato(socio.id);
    setNome(socio.nome);
    setCognome(socio.cognome);
    setCardId(socio.cardId);
    setValore(socio.frequenza?.toString() || "");
    setPrezzo(socio.prezzo?.toString() || "");
    setModificaIscritto(true);
    estrai_info_socio(socio.id); // Passiamo l'ID direttamente
    setModificaIscritto(true);
    setDataScadenza(socio.dataScadenza || "");
  };

  const handleTextChange = (inputText: string) => {
    const numericValue = parseInt(inputText.replace(/[^0-9]/g, ""), 10);
    if (!numericValue) {
      setValore("");
      return;
    }
    setValore(Math.min(Math.max(numericValue, 1), 5).toString());
  };

  const apriProfilo = () => {
    if (!socioSelezionato) {
      Alert.alert("Errore", "Nessun socio selezionato.");
      return;
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    setDataProfilo(formattaDataIT(oggi));
    setMeseProfilo(new Date(oggi.getFullYear(), oggi.getMonth(), 1));
    setProfiloVisibile(true);
  };

  const cambiaMeseProfilo = (direzione: number) => {
    const nuovoMese = new Date(
      meseProfilo.getFullYear(),
      meseProfilo.getMonth() + direzione,
      1,
    );

    setMeseProfilo(nuovoMese);
    setDataProfilo(formattaDataIT(nuovoMese));
  };

  const giorniCalendario = useMemo(() => {
    const anno = meseProfilo.getFullYear();
    const mese = meseProfilo.getMonth();
    const primoGiorno = new Date(anno, mese, 1);
    const offsetLunedi = (primoGiorno.getDay() + 6) % 7;
    const totaleGiorni = new Date(anno, mese + 1, 0).getDate();
    const celle: {
      key: string;
      data?: string;
      giorno?: number;
      haAccesso?: boolean;
      vuoto?: boolean;
    }[] = [];

    for (let i = 0; i < offsetLunedi; i += 1) {
      celle.push({ key: `vuoto-${i}`, vuoto: true });
    }

    for (let giorno = 1; giorno <= totaleGiorni; giorno += 1) {
      const data = formattaDataIT(new Date(anno, mese, giorno));
      celle.push({
        key: data,
        data,
        giorno,
        haAccesso: !!accessiProfilo[data],
      });
    }

    return celle;
  }, [meseProfilo, accessiProfilo]);

  const accessoDataSelezionata = accessiProfilo[dataProfilo];
  const sociDaMostrare = useMemo(
    () => ordinaSociPerCognome(sociFiltrati),
    [sociFiltrati],
  );

  // CRUD FIREBASE
  const AggiungiSocio = async () => {
    if (!nome || !cognome || !cardId || !valore || !prezzo) {
      Alert.alert("Errore", "Completa tutti i campi!");
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, "soci"), {
        nome: nome.trim(),
        cognome: cognome.trim(),
        cardId: cardId.trim(),
        admin: isCardAdmin(cardId),
        frequenza: parseInt(valore, 10),
        prezzo: parseFloat(prezzo.replace(",", ".")),
        dataIscrizione: serverTimestamp(),
        recupero: 0,
        calc_frequenza: 0,
        scadenzamese: 0,
        doppio_ingresso: 0,
        dataScadenza: await Calcolo_Scadenza(),
      });
      setIscrizione(false);
      Alert.alert("Ottimo!", "Socio iscritto.");
    } catch {
      Alert.alert("Errore", "Salvataggio fallito.");
    } finally {
      setLoading(false);
    }
  };

  const ModificaSocio = async () => {
    const dataScadenzaNormalizzata = normalizzaDataScadenza(dataScadenza);

    if (!dataScadenzaNormalizzata) {
      Alert.alert(
        "Errore",
        "Inserisci la data scadenza nel formato GG-MM-AAAA.",
      );
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, "soci", socioSelezionato), {
        nome: nome.trim(),
        cognome: cognome.trim(),
        cardId: cardId.trim(),
        admin: isCardAdmin(cardId),
        frequenza: parseInt(valore, 10),
        prezzo: parseFloat(prezzo.replace(",", ".")),
        dataScadenza: dataScadenzaNormalizzata,
      });
      setDataScadenza(dataScadenzaNormalizzata);
      setModificaIscritto(false);
    } catch {
      Alert.alert("Errore", "Modifica fallita.");
    } finally {
      setLoading(false);
    }
  };

  const RinnovaMese = async () => {
    setLoading(true);
    try {
      const nuovaScadenza = Calcolo_Rinnovo_Mese();

      await updateDoc(doc(db, "soci", socioSelezionato), {
        dataScadenza: nuovaScadenza,
      });
      setDataScadenza(nuovaScadenza);
      Alert.alert("Mese rinnovato", `Nuova scadenza: ${nuovaScadenza}`);
    } catch {
      Alert.alert("Errore", "Rinnovo mese fallito.");
    } finally {
      setLoading(false);
    }
  };

  const ValidaIngressoManuale = async () => {
    if (!socioSelezionato) {
      Alert.alert("Errore", "Nessun socio selezionato.");
      return;
    }

    const oggi = getOggiFormatoIT();
    const dataRef = new Date();
    const anno = String(dataRef.getFullYear());
    const mese = String(dataRef.getMonth() + 1).padStart(2, "0");
    const socioDocRef = doc(db, "soci", socioSelezionato);
    const ingressiOggiRef = collection(
      db,
      "accessi",
      anno,
      mese,
      oggi,
      "ingressi_del_giorno",
    );
    const ingressoDocRef = doc(ingressiOggiRef, socioSelezionato);
    let esito = "OK";

    setLoading(true);
    try {
      const ingressoGiaInStorico = !(
        await getDocs(
          query(ingressiOggiRef, where("socioId", "==", socioSelezionato)),
        )
      ).empty;

      await runTransaction(db, async (transaction) => {
        const snapSocio = await transaction.get(socioDocRef);

        if (!snapSocio.exists()) {
          throw "USER_NOT_FOUND";
        }

        const snapIngressoOggi = await transaction.get(ingressoDocRef);
        const dati = snapSocio.data();
        const dataUltimoAccesso = dati.ultimo_giorno_accesso || "";
        const ultimoAccessoOggi = stessaData(dataUltimoAccesso, oggi);
        let ingressiOggi = dati.doppio_ingresso || 0;
        let calcoloFrequenza = dati.calc_frequenza || 0;
        const frequenzaSettimanale = dati.frequenza || 0;
        const recuperoGg = dati.recupero || 0;
        const scadenza = dati.dataScadenza || "";

        if (!stessaSettimana(dataUltimoAccesso, oggi)) {
          calcoloFrequenza = 0;
        }

        if (!ultimoAccessoOggi) {
          ingressiOggi = 0;
        }

        if (
          snapIngressoOggi.exists() ||
          ingressoGiaInStorico ||
          (ingressiOggi >= 1 && ultimoAccessoOggi)
        ) {
          esito = "GIA_PRESENTE";
          return;
        }

        if (dataToNum(oggi) > dataToNum(scadenza)) {
          const frequenzaBase = Math.min(
            Math.max(frequenzaSettimanale - recuperoGg, 0),
            5,
          );
          const anomaliaDocRef = doc(
            collection(db, "anomalie", anno, mese, oggi, "eventi"),
          );

          transaction.set(ingressoDocRef, {
            nome: dati.nome || nome.trim(),
            cognome: dati.cognome || cognome.trim(),
            cardId: dati.cardId || cardId.trim(),
            ingresso: serverTimestamp(),
            uscita: null,
            uscita_ms: null,
            stato: "dentro",
            gestioneUscita: true,
            socioId: socioSelezionato,
            manuale: true,
          });

          transaction.update(socioDocRef, {
            doppio_ingresso: ingressiOggi + 1,
            ultimo_giorno_accesso: oggi,
            ultimo_ingresso_ms: Date.now(),
            calc_frequenza: 1,
            frequenza: frequenzaBase,
            recupero: 0,
            anomalia_mese_scaduto: (dati.anomalia_mese_scaduto || 0) + 1,
            data_anomalia_mese_scaduto: oggi,
            ultimo_tentativo_mese_scaduto_ms: Date.now(),
          });

          transaction.set(anomaliaDocRef, {
            tipo: "mese_scaduto",
            nome: dati.nome || nome.trim(),
            cognome: dati.cognome || cognome.trim(),
            cardId: dati.cardId || cardId.trim(),
            socioId: socioSelezionato,
            data: oggi,
            creato: serverTimestamp(),
          });

          esito = "MESE_SCADUTO";
          return;
        }

        if (calcoloFrequenza >= frequenzaSettimanale) {
          const anomaliaDocRef = doc(
            collection(db, "anomalie", anno, mese, oggi, "eventi"),
          );

          transaction.update(socioDocRef, {
            anomalia_frequenza_settimanale:
              (dati.anomalia_frequenza_settimanale || 0) + 1,
            data_anomalia_frequenza_settimanale: oggi,
            ultimo_tentativo_frequenza_settimanale_ms: Date.now(),
          });

          transaction.set(anomaliaDocRef, {
            tipo: "frequenza_settimanale",
            nome: dati.nome || nome.trim(),
            cognome: dati.cognome || cognome.trim(),
            cardId: dati.cardId || cardId.trim(),
            socioId: socioSelezionato,
            data: oggi,
            creato: serverTimestamp(),
          });

          esito = "FREQUENZA_SUPERATA";
          return;
        }

        transaction.set(ingressoDocRef, {
          nome: dati.nome || nome.trim(),
          cognome: dati.cognome || cognome.trim(),
          cardId: dati.cardId || cardId.trim(),
          ingresso: serverTimestamp(),
          uscita: null,
          uscita_ms: null,
          stato: "dentro",
          gestioneUscita: true,
          socioId: socioSelezionato,
          manuale: true,
        });

        transaction.update(socioDocRef, {
          doppio_ingresso: ingressiOggi + 1,
          ultimo_giorno_accesso: oggi,
          ultimo_ingresso_ms: Date.now(),
          calc_frequenza: calcoloFrequenza + 1,
          frequenza: frequenzaSettimanale,
          recupero: recuperoGg,
        });
      });

      if (esito === "GIA_PRESENTE") {
        Alert.alert(
          "Ingresso gia presente",
          "Il socio risulta gia validato oggi.",
        );
      } else if (esito === "MESE_SCADUTO") {
        Alert.alert(
          "Ingresso validato",
          "Mese scaduto: controllare il pagamento.",
        );
      } else if (esito === "FREQUENZA_SUPERATA") {
        Alert.alert("Accesso negato", "Frequenza settimanale superata.");
      } else {
        Alert.alert("Ingresso validato", `${nome} ${cognome}`);
      }
    } catch (error) {
      console.error("Errore validazione ingresso manuale:", error);
      Alert.alert("Errore", "Validazione ingresso fallita.");
    } finally {
      setLoading(false);
    }
  };

  const ValidaUscitaManuale = async () => {
    if (!socioSelezionato) {
      Alert.alert("Errore", "Nessun socio selezionato.");
      return;
    }

    const oggi = getOggiFormatoIT();
    const socioDocRef = doc(db, "soci", socioSelezionato);
    const ingressiRefs = new Map<string, any>();
    let esito = "OK";
    const oraUscita = Date.now();

    setLoading(true);
    try {
      await Promise.all(
        getPercorsiData(oggi).map(async (percorso) => {
          const ingressiRef = collection(
            db,
            "accessi",
            percorso.anno,
            percorso.mese,
            percorso.giorno,
            "ingressi_del_giorno",
          );
          const ingressoDocRef = doc(ingressiRef, socioSelezionato);
          const ingressiSocioSnapshot = await getDocs(
            query(ingressiRef, where("socioId", "==", socioSelezionato)),
          );

          ingressiRefs.set(ingressoDocRef.path, ingressoDocRef);
          ingressiSocioSnapshot.docs.forEach((ingressoDoc) => {
            ingressiRefs.set(ingressoDoc.ref.path, ingressoDoc.ref);
          });
        }),
      );

      await runTransaction(db, async (transaction) => {
        const snapSocio = await transaction.get(socioDocRef);

        if (!snapSocio.exists()) {
          throw "USER_NOT_FOUND";
        }

        const snapshotsIngresso = [];

        for (const ingressoRef of ingressiRefs.values()) {
          const snapIngresso = await transaction.get(ingressoRef);

          if (snapIngresso.exists()) {
            snapshotsIngresso.push(snapIngresso);
          }
        }

        if (snapshotsIngresso.length === 0) {
          esito = "NESSUN_INGRESSO";
          return;
        }

        const ingressiDaChiudere = snapshotsIngresso.filter((snapIngresso) => {
          const datiIngresso = snapIngresso.data() as any;

          return !(
            datiIngresso.uscita ||
            datiIngresso.uscita_ms ||
            datiIngresso.stato === "uscito"
          );
        });

        if (ingressiDaChiudere.length === 0) {
          esito = "USCITA_PRESENTE";
          return;
        }

        ingressiDaChiudere.forEach((snapIngresso) => {
          transaction.update(snapIngresso.ref, {
            uscita: serverTimestamp(),
            uscita_ms: oraUscita,
            stato: "uscito",
            uscitaManuale: true,
          });
        });

        transaction.update(socioDocRef, {
          ultimo_giorno_uscita: oggi,
          ultimo_uscita_ms: oraUscita,
          ultimo_ingresso_ms: oraUscita,
        });
      });

      if (esito === "NESSUN_INGRESSO") {
        Alert.alert(
          "Uscita non registrata",
          "Il socio non ha un ingresso registrato oggi.",
        );
      } else if (esito === "USCITA_PRESENTE") {
        Alert.alert("Uscita gia presente", "Il socio risulta gia uscito oggi.");
      } else {
        Alert.alert("Uscita registrata", `${nome} ${cognome}`);
      }
    } catch (error) {
      console.error("Errore validazione uscita manuale:", error);
      Alert.alert("Errore", "Validazione uscita fallita.");
    } finally {
      setLoading(false);
    }
  };

  const EliminaSocio = () => {
    if (!socioSelezionato) {
      Alert.alert("Errore", "Nessun socio selezionato.");
      return;
    }

    setConfermaEliminazione(true);
  };

  const ConfermaEliminaSocio = async () => {
    const socioDaEliminare = socioSelezionato;

    if (!socioDaEliminare) {
      Alert.alert("Errore", "Nessun socio selezionato.");
      return;
    }

    setLoading(true);
    try {
      await deleteDoc(doc(db, "soci", socioDaEliminare));
      setConfermaEliminazione(false);
      setModificaIscritto(false);
      setSocioSelezionato("");
    } catch (e) {
      console.error("Errore eliminazione socio:", e);
      Alert.alert("Errore", "Eliminazione fallita.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <View style={styles.area_ricerca}>
          <TextInput
            placeholder="Cerca iscritto..."
            style={styles.textarea}
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          <TouchableOpacity onPress={apriscritto}>
            <View style={styles.btn}>
              <Text style={styles.txtbtn}>+ Nuovo</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {sociDaMostrare.map((socio) => (
          <View style={styles.itemRow} key={socio.id}>
            <Ionicons name="ellipse-sharp" size={20} color="#64def3" />
            <Text style={styles.itemText} numberOfLines={1}>
              {socio.cognome} {socio.nome}
            </Text>
            {(socio.admin || isCardAdmin(socio.cardId || "")) && (
              <Text style={styles.adminBadge}>Admin</Text>
            )}
            <TouchableOpacity onPress={() => apriModifica(socio)}>
              <Text style={styles.itemText1}>Modifica</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* MODAL NUOVO ISCRITTO */}
      <Modal visible={iscrizione} transparent animationType="slide">
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Nuovo Iscritto 🏋️‍♂️</Text>
            <TextInput
              placeholder="Nome"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              value={nome}
              onChangeText={setNome}
            />
            <TextInput
              placeholder="Cognome"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              value={cognome}
              onChangeText={setCognome}
            />
            <TextInput
              placeholder="Card ID"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={cardId}
              onChangeText={setCardId}
            />
            <TextInput
              placeholder="Frequenza (1-5)"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={valore}
              onChangeText={handleTextChange}
            />
            <TextInput
              placeholder="Prezzo (€)"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={prezzo}
              onChangeText={setPrezzo}
            />

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.buttonAdd]}
                onPress={AggiungiSocio}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Aggiungi</Text>
                )}
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

      {/* MODAL MODIFICA */}
      <Modal visible={modifica_iscritto} transparent animationType="slide">
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Modifica Iscritto</Text>
            <TextInput
              placeholder="Nome"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              value={nome}
              onChangeText={setNome}
            />
            <TextInput
              placeholder="Cognome"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              value={cognome}
              onChangeText={setCognome}
            />
            <TextInput
              placeholder="Card ID"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={cardId}
              onChangeText={setCardId}
            />
            <TextInput
              placeholder="Frequenza (1-5)"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={valore}
              onChangeText={handleTextChange}
            />
            <TextInput
              placeholder="Prezzo (€)"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={prezzo}
              onChangeText={setPrezzo}
            />
            <TextInput
              placeholder="Data Scadenza (GG-MM-AAAA)"
              style={styles.textareamodal}
              placeholderTextColor="#888"
              value={dataScadenza}
              onChangeText={setDataScadenza}
            />

            <View style={styles.accessi}>
              <Text style={styles.detailText}>
                Ingressi Settimanali: {infoIscritto?.calc_frequenza} /{" "}
                {infoIscritto?.frequenza}
              </Text>
              <Text style={styles.detailText}>
                Recuperi: {infoIscritto?.recupero}
              </Text>
              {/* <Text style={styles.detailText}>Cognome: {infoIscritto?.cognome}</Text> */}
            </View>

            <Pressable
              style={[styles.manualButton]}
              onPress={ValidaIngressoManuale}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Valida Ingresso Oggi</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.manualExitButton]}
              onPress={ValidaUscitaManuale}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Dichiara Uscita Oggi</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.profileButton]}
              onPress={apriProfilo}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Visualizza Profilo</Text>
            </Pressable>

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.buttonAdd]}
                onPress={ModificaSocio}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Modifica</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonClose]}
                onPress={() => setModificaIscritto(false)}
              >
                <Text style={styles.buttonText}>Annulla</Text>
              </Pressable>
            </View>
            <TouchableOpacity onPress={EliminaSocio} style={{ marginTop: 20 }}>
              <Text
                style={{ color: "#ff4444", textDecorationLine: "underline" }}
              >
                Elimina Socio
              </Text>
            </TouchableOpacity>
            {/* {oggi < dataScadenza && ( */}
            <TouchableOpacity onPress={RinnovaMese} style={{ marginTop: 20 }}>
              <Text
                style={{ color: "#ff4444", textDecorationLine: "underline" }}
              >
                Rinnova Mese
              </Text>
            </TouchableOpacity>
            {/* )} */}
          </View>
        </View>
      </Modal>

      <Modal visible={profilo_visibile} transparent animationType="slide">
        <View style={styles.centeredView}>
          <View style={styles.profileModalView}>
            <Text style={styles.modalTitle}>
              Profilo {nome} {cognome}
            </Text>

            <View style={styles.monthHeader}>
              <TouchableOpacity
                style={styles.monthButton}
                onPress={() => cambiaMeseProfilo(-1)}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {formattaMeseAnno(meseProfilo)}
              </Text>
              <TouchableOpacity
                style={styles.monthButton}
                onPress={() => cambiaMeseProfilo(1)}
              >
                <Ionicons name="chevron-forward" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekHeader}>
              {["L", "M", "M", "G", "V", "S", "D"].map((giorno, index) => (
                <Text key={`${giorno}-${index}`} style={styles.weekDay}>
                  {giorno}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {giorniCalendario.map((cella) => (
                <TouchableOpacity
                  key={cella.key}
                  style={[
                    styles.calendarDay,
                    cella.vuoto && styles.calendarDayEmpty,
                    cella.data === dataProfilo && styles.calendarDaySelected,
                    cella.haAccesso && styles.calendarDayWithAccess,
                  ]}
                  disabled={cella.vuoto}
                  onPress={() => cella.data && setDataProfilo(cella.data)}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      cella.data === dataProfilo &&
                        styles.calendarDayTextSelected,
                    ]}
                  >
                    {cella.giorno || ""}
                  </Text>
                  {cella.haAccesso && <View style={styles.accessDot} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.profileDayBox}>
              <Text style={styles.profileDayTitle}>{dataProfilo}</Text>
              {caricamentoProfilo ? (
                <Text style={styles.profileDaySubtext}>Carico presenze...</Text>
              ) : accessoDataSelezionata ? (
                <>
                  <Text style={styles.profileDayText}>
                    Ingresso:{" "}
                    {formattaOrario(
                      accessoDataSelezionata.ingresso,
                      accessoDataSelezionata.ingresso_ms,
                    )}
                  </Text>
                  <Text style={styles.profileDayText}>
                    Uscita:{" "}
                    {formattaOrario(
                      accessoDataSelezionata.uscita,
                      accessoDataSelezionata.uscita_ms,
                    )}
                  </Text>
                  <Text style={styles.profileDaySubtext}>
                    Stato:{" "}
                    {accessoDataSelezionata.stato === "uscito" ||
                    accessoDataSelezionata.uscita
                      ? "Uscito"
                      : "Dentro"}
                    {accessoDataSelezionata.manuale
                      ? " - ingresso manuale"
                      : ""}
                    {accessoDataSelezionata.uscitaManuale
                      ? " - uscita manuale"
                      : ""}
                  </Text>
                </>
              ) : (
                <Text style={styles.profileDaySubtext}>
                  Nessuna presenza registrata in questo giorno.
                </Text>
              )}
            </View>

            <Pressable
              style={[
                styles.button,
                styles.buttonClose,
                styles.fullWidthButton,
              ]}
              onPress={() => setProfiloVisibile(false)}
            >
              <Text style={styles.buttonText}>Chiudi Profilo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={conferma_eliminazione} transparent animationType="fade">
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Elimina Socio</Text>
            <Text style={styles.confirmText}>
              Vuoi eliminare {nome} {cognome}?
            </Text>
            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.buttonDelete]}
                onPress={ConfermaEliminaSocio}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Elimina</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonClose]}
                onPress={() => setConfermaEliminazione(false)}
                disabled={loading}
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
  accessi: {},
  detailText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: "#3a3b3b",
    padding: 15,
    borderRadius: 12,
    textAlign: "center",
  },
  container: { flex: 1, alignItems: "center", backgroundColor: "#101010" },
  infoContainer: {
    marginTop: 60,
    width: "90%",
    backgroundColor: "#1A1C24",
    borderRadius: 20,
  },
  area_ricerca: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 15,
  },
  textarea: { flex: 1, color: "white", fontSize: 16 },
  txtbtn: { color: "white", fontWeight: "bold" },
  btn: {
    backgroundColor: "#459E7B",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 15,
  },
  scrollView: { width: "90%", marginTop: 20 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1C24",
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
  },
  itemText: { color: "#fff", fontSize: 16, marginLeft: 12, flex: 1 },
  adminBadge: {
    color: "#101010",
    backgroundColor: "#64def3",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  itemText1: { color: "#64def3", fontSize: 14, fontWeight: "bold" },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  modalView: {
    width: "85%",
    backgroundColor: "#1A1C24",
    borderRadius: 25,
    padding: 25,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  confirmText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  textareamodal: {
    width: "100%",
    backgroundColor: "#252833",
    borderRadius: 12,
    padding: 15,
    color: "#fff",
    marginBottom: 15,
  },
  buttonContainer: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: { flex: 1, padding: 15, borderRadius: 12, alignItems: "center" },
  manualButton: {
    width: "100%",
    backgroundColor: "#5CB4EA",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  manualExitButton: {
    width: "100%",
    backgroundColor: "#7B61FF",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  profileButton: {
    width: "100%",
    backgroundColor: "#252833",
    borderWidth: 1,
    borderColor: "#64def3",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonAdd: { backgroundColor: "#459E7B" },
  buttonDelete: { backgroundColor: "#ff4444" },
  buttonClose: { backgroundColor: "#333" },
  fullWidthButton: { width: "100%", flex: 0, marginTop: 14 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  profileModalView: {
    width: "92%",
    maxWidth: 520,
    backgroundColor: "#1A1C24",
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
  },
  monthHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  monthButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#252833",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  weekHeader: { width: "100%", flexDirection: "row", marginBottom: 6 },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#aaa",
    fontSize: 12,
    fontWeight: "800",
  },
  calendarGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap" },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginVertical: 2,
  },
  calendarDayEmpty: { opacity: 0 },
  calendarDaySelected: { backgroundColor: "#5CB4EA" },
  calendarDayWithAccess: { borderWidth: 1, borderColor: "#459E7B" },
  calendarDayText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  calendarDayTextSelected: { color: "#101010" },
  accessDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#459E7B",
    marginTop: 3,
  },
  profileDayBox: {
    width: "100%",
    backgroundColor: "#252833",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  profileDayTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  profileDayText: { color: "#fff", fontSize: 15, marginBottom: 5 },
  profileDaySubtext: { color: "#aaa", fontSize: 13, lineHeight: 18 },
});
