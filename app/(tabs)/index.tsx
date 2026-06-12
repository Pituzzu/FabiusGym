import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { getDatabase, onValue, ref, set } from "firebase/database";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../config/firebaseConfig";

// --- 1. FUNZIONI DI LOGICA (Fuori dal componente HomeScreen) ---

const getOggiFormatoIT = () => {
  const oggi = new Date();
  const giorno = String(oggi.getDate()).padStart(2, "0");
  const mese = String(oggi.getMonth() + 1).padStart(2, "0");
  const anno = oggi.getFullYear();

  return `${giorno}-${mese}-${anno}`;
};

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

const getIngressoMs = (ingresso: any) => {
  if (ingresso?.toDate) {
    return ingresso.toDate().getTime();
  }

  return 0;
};

const getEventoAccessoMs = (accesso: any) =>
  Math.max(
    getIngressoMs(accesso?.ingresso),
    getIngressoMs(accesso?.uscita),
    Number(accesso?.ingresso_ms) || 0,
    Number(accesso?.uscita_ms) || 0,
  );

const accessoRisultaUscito = (accesso: any) =>
  accesso?.stato === "uscito" || !!accesso?.uscita || !!accesso?.uscita_ms;

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

const DUPLICATE_SCAN_WINDOW_MS = 1500;
const MIN_EXIT_AFTER_ENTRY_MS = 2 * 60 * 1000;
const CARD_RESET_RECUPERI = "C34F8E0D";
const GIORNI_APERTURA_SETTIMANALI = 5;
const VENERDI = 5;
const isCardResetRecuperi = (cardId: string) =>
  cardId.trim().toUpperCase() === CARD_RESET_RECUPERI;
type TipoNotifica = "success" | "warning" | "error";
type NotificaAccesso = {
  titolo: string;
  messaggio: string;
  tipo: TipoNotifica;
};
type Appunto = {
  id: string;
  testo: string;
  risolto?: boolean;
  creato_ms?: number;
  aggiornato_ms?: number;
};
type TipoAccessoRegistrato = "ingresso" | "uscita";
type RisultatoAccessoSocio = {
  nome?: string;
  cognome?: string;
  tipoAccesso: TipoAccessoRegistrato;
  [key: string]: any;
};

const toNumeroSicuro = (valore: unknown) => {
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : 0;
};

const calcolaRecuperoMassimoDaFrequenzaBase = (frequenzaBase: number) => {
  if (frequenzaBase >= 5) {
    return 0;
  }

  if (frequenzaBase === 4) {
    return 1;
  }

  return Math.max(GIORNI_APERTURA_SETTIMANALI - frequenzaBase, 0);
};

const calcolaFrequenzaConRecuperiLimitati = (
  frequenza: unknown,
  recupero: unknown,
) => {
  const frequenzaSettimanale = toNumeroSicuro(frequenza);
  const recuperoGg = toNumeroSicuro(recupero);
  const frequenzaBase = Math.min(
    Math.max(frequenzaSettimanale - recuperoGg, 0),
    GIORNI_APERTURA_SETTIMANALI,
  );
  const recuperoMassimo = calcolaRecuperoMassimoDaFrequenzaBase(frequenzaBase);
  const recuperoLimitato = Math.min(Math.max(recuperoGg, 0), recuperoMassimo);

  return {
    frequenzaBase,
    recuperoMassimo,
    recuperoLimitato,
    frequenzaTotale: frequenzaBase + recuperoLimitato,
  };
};

const getIngressoDate = (accesso: any) => {
  if (accesso?.ingresso?.toDate) {
    return accesso.ingresso.toDate();
  }

  const ingressoMs = Number(accesso?.ingresso_ms) || 0;
  return ingressoMs ? new Date(ingressoMs) : null;
};

const getScadenzaFasciaUscitaMs = (accesso: any) => {
  const dataIngresso = getIngressoDate(accesso);

  if (!dataIngresso) {
    return 0;
  }

  const minutiIngresso =
    dataIngresso.getHours() * 60 + dataIngresso.getMinutes();
  const scadenza = new Date(dataIngresso);

  if (minutiIngresso >= 10 * 60 && minutiIngresso <= 14 * 60) {
    scadenza.setHours(14, 0, 0, 0);
    return scadenza.getTime();
  }

  if (minutiIngresso >= 16 * 60 && minutiIngresso <= 23 * 60) {
    scadenza.setHours(23, 0, 0, 0);
    return scadenza.getTime();
  }

  return 0;
};

const isUscitaNonTimbrataScaduta = (accesso: any, oraCorrenteMs: number) => {
  if (accessoRisultaUscito(accesso)) {
    return false;
  }

  const scadenzaFasciaMs = getScadenzaFasciaUscitaMs(accesso);
  return !!scadenzaFasciaMs && oraCorrenteMs > scadenzaFasciaMs;
};

const getAppuntoMs = (appunto: Appunto) =>
  appunto.aggiornato_ms || appunto.creato_ms || 0;

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
    const [g, m, a] = dStr.split("-").map(Number);
    return new Date(a, m - 1, g).getTime();
  };

  for (const socioDoc of sociSnapshot.docs) {
    const dati = socioDoc.data();
    const meseScaduto =
      dati.dataScadenza && dataToNum(oggi) > dataToNum(dati.dataScadenza);

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
    const { frequenzaBase, recuperoMassimo } =
      calcolaFrequenzaConRecuperiLimitati(frequenza_settimanale, recupero_gg);
    const recuperiMaturati =
      calcolo_frequenza > 0 ? Math.max(frequenzaBase - calcolo_frequenza, 0) : 0;
    const recuperoDaAttribuire = Math.min(recuperiMaturati, recuperoMassimo);

    batch.update(socioDoc.ref, {
      calc_frequenza: 0,
      frequenza: frequenzaBase + recuperoDaAttribuire,
      recupero: recuperoDaAttribuire,
      ultimo_reset_recuperi: oggi,
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

const chiudiUsciteNonTimbrateByAdmin = async (socioId?: string) => {
  const oggi = getOggiFormatoIT();
  const oraUscita = Date.now();
  const accessiTrovati = new Map<string, { ref: any; dati: any }>();

  const aggiungiAccesso = (accessoDoc: any) => {
    accessiTrovati.set(accessoDoc.ref.path, {
      ref: accessoDoc.ref,
      dati: { id: accessoDoc.id, ...accessoDoc.data() },
    });
  };

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

      if (socioId) {
        const ingressoDirettoRef = doc(ingressiRef, socioId);
        const [ingressoDirettoSnapshot, ingressiSocioSnapshot] =
          await Promise.all([
            getDoc(ingressoDirettoRef),
            getDocs(query(ingressiRef, where("socioId", "==", socioId))),
          ]);

        if (ingressoDirettoSnapshot.exists()) {
          aggiungiAccesso(ingressoDirettoSnapshot);
        }

        ingressiSocioSnapshot.docs.forEach(aggiungiAccesso);
        return;
      }

      const snapshot = await getDocs(ingressiRef);
      snapshot.docs.forEach(aggiungiAccesso);
    }),
  );

  const accessiDaChiudere = Array.from(accessiTrovati.values()).filter(
    ({ dati }) => {
      const idSocio = String(dati.socioId || dati.id || "");

      return (
        (!socioId || idSocio === socioId) &&
        !isCardResetRecuperi(String(dati.cardId || "")) &&
        isUscitaNonTimbrataScaduta(dati, oraUscita)
      );
    },
  );

  if (accessiDaChiudere.length === 0) {
    return { usciteChiuse: 0, sociCoinvolti: 0 };
  }

  let batch = writeBatch(db);
  let operazioniBatch = 0;
  const sociCoinvolti = new Set<string>();

  const commitSeNecessario = async () => {
    if (operazioniBatch >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      operazioniBatch = 0;
    }
  };

  for (const { ref: ingressoRef, dati } of accessiDaChiudere) {
    const idSocio = String(dati.socioId || socioId || "");

    batch.update(ingressoRef, {
      uscita: serverTimestamp(),
      uscita_ms: oraUscita,
      stato: "uscito",
      uscitaManuale: true,
      uscitaByAdmin: true,
    });
    operazioniBatch += 1;

    if (idSocio) {
      sociCoinvolti.add(idSocio);
      batch.update(doc(db, "soci", idSocio), {
        ultimo_giorno_uscita: oggi,
        ultimo_uscita_ms: oraUscita,
        ultimo_ingresso_ms: oraUscita,
      });
      operazioniBatch += 1;
    }

    await commitSeNecessario();
  }

  if (operazioniBatch > 0) {
    await batch.commit();
  }

  return {
    usciteChiuse: accessiDaChiudere.length,
    sociCoinvolti: sociCoinvolti.size,
  };
};

const registraIngressoSocio = async (
  cardId: string,
  scanTime: number = Date.now(),
): Promise<RisultatoAccessoSocio> => {
  const cardIdPulita = cardId.trim();
  const oggi = getOggiFormatoIT();
  const dataRef = new Date();
  const anno = String(dataRef.getFullYear());
  const mese = String(dataRef.getMonth() + 1).padStart(2, "0");

  const qSocio = query(
    collection(db, "soci"),
    where("cardId", "==", cardIdPulita),
  );
  const querySnapshot = await getDocs(qSocio);
  if (querySnapshot.empty) throw "USER_NOT_FOUND";

  const socioDoc = querySnapshot.docs[0];
  const socioId = socioDoc.id;
  const socioData = socioDoc.data();
  const socioDocRef = doc(db, "soci", socioId);
  const ingressiOggiRef = collection(
    db,
    "accessi",
    anno,
    mese,
    oggi,
    "ingressi_del_giorno",
  );
  const ingressoDocRef = doc(ingressiOggiRef, socioId);
  const ingressiOggiRefs = new Map<string, any>();

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
      const ingressoDirettoRef = doc(ingressiRef, socioId);
      const ingressiSocioSnapshot = await getDocs(
        query(ingressiRef, where("socioId", "==", socioId)),
      );

      ingressiOggiRefs.set(ingressoDirettoRef.path, ingressoDirettoRef);
      ingressiSocioSnapshot.docs.forEach((ingressoDoc) => {
        ingressiOggiRefs.set(ingressoDoc.ref.path, ingressoDoc.ref);
      });
    }),
  );

  let erroreAccesso: string | null = null;
  let tipoAccesso: TipoAccessoRegistrato = "ingresso";

  await runTransaction(db, async (transaction) => {
    const snapSocio = await transaction.get(socioDocRef);
    if (!snapSocio.exists()) throw "USER_NOT_FOUND";
    const snapIngressoOggi = await transaction.get(ingressoDocRef);
    const snapIngressiOggi = [];

    for (const ingressoRef of ingressiOggiRefs.values()) {
      const snapIngresso =
        ingressoRef.path === ingressoDocRef.path
          ? snapIngressoOggi
          : await transaction.get(ingressoRef);

      if (snapIngresso.exists()) {
        snapIngressiOggi.push(snapIngresso);
      }
    }

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

    const ingressoGiaRegistratoOggi = snapIngressiOggi.length > 0;
    const profiloSegnaIngressoOggi = ingressiOggi >= 1 && ultimoAccessoOggi;
    const stessoPassaggioGiaProcessato =
      ultimoAccessoOggi &&
      ultimoIngressoMs &&
      Math.abs(scanTime - ultimoIngressoMs) < DUPLICATE_SCAN_WINDOW_MS;
    const ingressiAperti = snapIngressiOggi
      .filter((snapIngresso) => !accessoRisultaUscito(snapIngresso.data()))
      .sort(
        (a, b) => getEventoAccessoMs(b.data()) - getEventoAccessoMs(a.data()),
      );
    const ingressoAperto = ingressiAperti[0];
    const datiIngressoOggi = (ingressoAperto?.data() ||
      (snapIngressoOggi.exists() ? snapIngressoOggi.data() : null)) as any;
    const uscitaGiaRegistrata = !!(
      datiIngressoOggi?.uscita ||
      datiIngressoOggi?.uscita_ms ||
      datiIngressoOggi?.stato === "uscito"
    );
    const ingressoMs =
      getIngressoMs(datiIngressoOggi?.ingresso) || ultimoIngressoMs || 0;

    if (ingressoAperto && !uscitaGiaRegistrata) {
      if (stessoPassaggioGiaProcessato) {
        throw "DUPLICATE_SCAN";
      }

      if (!ingressoMs || scanTime - ingressoMs < MIN_EXIT_AFTER_ENTRY_MS) {
        erroreAccesso = "EXIT_TOO_EARLY";
        return;
      }

      ingressiAperti.forEach((snapIngresso) => {
        transaction.update(snapIngresso.ref, {
          uscita: serverTimestamp(),
          uscita_ms: scanTime,
          stato: "uscito",
        });
      });

      transaction.update(socioDocRef, {
        ultimo_giorno_uscita: oggi,
        ultimo_uscita_ms: scanTime,
        ultimo_ingresso_ms: scanTime,
      });

      tipoAccesso = "uscita";
      return;
    }

    if (ingressoGiaRegistratoOggi || profiloSegnaIngressoOggi) {
      if (stessoPassaggioGiaProcessato) {
        throw "DUPLICATE_SCAN";
      }

      const anomaliaDocRef = doc(
        collection(db, "anomalie", anno, mese, oggi, "eventi"),
      );

      if (!ingressoGiaRegistratoOggi && profiloSegnaIngressoOggi) {
        transaction.set(ingressoDocRef, {
          nome: socioData.nome,
          cognome: socioData.cognome,
          cardId: cardIdPulita,
          ingresso: serverTimestamp(),
          socioId: socioId,
          ripristinato: true,
        });
      }

      transaction.update(socioDocRef, {
        doppio_ingresso: Math.max(ingressiOggi, 1),
        anomalia_doppio_ingresso: (dati.anomalia_doppio_ingresso || 0) + 1,
        data_anomalia_doppio_ingresso: oggi,
        ultimo_tentativo_doppio_ingresso_ms: scanTime,
      });

      transaction.set(anomaliaDocRef, {
        tipo: "doppio_ingresso",
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp(),
      });

      erroreAccesso = "ALREADY_IN";
      return;
    }

    // --- HELPER PER CONFRONTO DATE ---
    const dataToNum = (dStr: string) => {
      const [g, m, a] = dStr.split("-").map(Number);
      return new Date(a, m - 1, g).getTime();
    };

    // --- 1° CONDIZIONE: Scadenza Mese ---
    if (dataToNum(oggi) > dataToNum(scadenza)) {
      if (!ultimoAccessoOggi) {
        ingressiOggi = 0;
      }

      const { frequenzaBase } = calcolaFrequenzaConRecuperiLimitati(
        frequenza_settimanale,
        recupero_gg,
      );
      const anomaliaDocRef = doc(
        collection(db, "anomalie", anno, mese, oggi, "eventi"),
      );
      transaction.set(ingressoDocRef, {
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        ingresso: serverTimestamp(),
        uscita: null,
        uscita_ms: null,
        stato: "dentro",
        gestioneUscita: true,
        socioId: socioId,
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
        ultimo_tentativo_mese_scaduto_ms: scanTime,
      });

      transaction.set(anomaliaDocRef, {
        tipo: "mese_scaduto",
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp(),
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

      const anomaliaDocRef = doc(
        collection(db, "anomalie", anno, mese, oggi, "eventi"),
      );

      transaction.update(socioDocRef, {
        anomalia_doppio_ingresso: (dati.anomalia_doppio_ingresso || 0) + 1,
        data_anomalia_doppio_ingresso: oggi,
        ultimo_tentativo_doppio_ingresso_ms: scanTime,
      });

      transaction.set(anomaliaDocRef, {
        tipo: "doppio_ingresso",
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp(),
      });

      erroreAccesso = "ALREADY_IN";
      return;
    }
    const incrementaFrequenza = ingressiOggi === 0;

    // --- BLOCCO FREQUENZA MASSIMA ---
    if (incrementaFrequenza && calcolo_frequenza >= frequenza_settimanale) {
      const anomaliaDocRef = doc(
        collection(db, "anomalie", anno, mese, oggi, "eventi"),
      );

      transaction.update(socioDocRef, {
        anomalia_frequenza_settimanale:
          (dati.anomalia_frequenza_settimanale || 0) + 1,
        data_anomalia_frequenza_settimanale: oggi,
        ultimo_tentativo_frequenza_settimanale_ms: scanTime,
      });

      transaction.set(anomaliaDocRef, {
        tipo: "frequenza_settimanale",
        nome: socioData.nome,
        cognome: socioData.cognome,
        cardId: cardIdPulita,
        socioId: socioId,
        data: oggi,
        creato: serverTimestamp(),
      });

      erroreAccesso = "FREQUENCY_EXCEEDED";
      return;
    }
    const nuovoCalcoloFrequenza = incrementaFrequenza
      ? calcolo_frequenza + 1
      : calcolo_frequenza;

    // Registrazione fisica ingresso
    transaction.set(ingressoDocRef, {
      nome: socioData.nome,
      cognome: socioData.cognome,
      cardId: cardIdPulita,
      ingresso: serverTimestamp(),
      uscita: null,
      uscita_ms: null,
      stato: "dentro",
      gestioneUscita: true,
      socioId: socioId,
    });

    // Aggiornamento contatore socio
    transaction.update(socioDocRef, {
      doppio_ingresso: ingressiOggi + 1,
      ultimo_giorno_accesso: oggi,
      ultimo_ingresso_ms: scanTime,
      calc_frequenza: nuovoCalcoloFrequenza,
      frequenza: frequenza_settimanale,
      recupero: recupero_gg,
    });
  });

  if (erroreAccesso) throw erroreAccesso;

  return { ...socioData, tipoAccesso };
};

// --- 2. COMPONENTE PRINCIPALE ---

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const [numeroIscritti, setNumeroIscritti] = useState(0);
  const [ingressiOggi, setIngressiOggi] = useState<any[]>([]);
  const [appunti, setAppunti] = useState<Appunto[]>([]);
  const [appuntiVisibili, setAppuntiVisibili] = useState(false);
  const [testoAppunto, setTestoAppunto] = useState("");
  const [appuntoInModifica, setAppuntoInModifica] = useState<Appunto | null>(
    null,
  );
  const [salvataggioAppunto, setSalvataggioAppunto] = useState(false);
  const [uscitaInValidazione, setUscitaInValidazione] = useState<string | null>(
    null,
  );
  const [oraCorrenteMs, setOraCorrenteMs] = useState(Date.now());
  const [notificaAccesso, setNotificaAccesso] =
    useState<NotificaAccesso | null>(null);
  const [giornoCorrente, setGiornoCorrente] = useState(getOggiFormatoIT());
  const lastProcessedScan = useRef({ cardId: "", time: 0 });
  const notificaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appuntiAperti = appunti.filter((appunto) => !appunto.risolto);

  const mostraNotifica = useCallback(
    (titolo: string, messaggio: string, tipo: TipoNotifica) => {
      if (notificaTimer.current) {
        clearTimeout(notificaTimer.current);
      }

      setNotificaAccesso({ titolo, messaggio, tipo });
      notificaTimer.current = setTimeout(() => {
        setNotificaAccesso(null);
        notificaTimer.current = null;
      }, 6000);
    },
    [],
  );

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
      setOraCorrenteMs(Date.now());
    };

    aggiornaGiornoCorrente();
    const timer = setInterval(aggiornaGiornoCorrente, 60000);

    return () => clearInterval(timer);
  }, []);

  // Listener Iscritti Totali
  useEffect(() => {
    return onSnapshot(collection(db, "soci"), (snap) =>
      setNumeroIscritti(snap.size),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "appunti"),
      (snap) => {
        const prossimiAppunti = snap.docs
          .map((appuntoDoc) => ({
            id: appuntoDoc.id,
            ...(appuntoDoc.data() as Omit<Appunto, "id">),
          }))
          .sort((a, b) => {
            if (!!a.risolto !== !!b.risolto) {
              return a.risolto ? 1 : -1;
            }

            return getAppuntoMs(b) - getAppuntoMs(a);
          });

        setAppunti(prossimiAppunti);
      },
      (error) => {
        console.error("Errore onSnapshot appunti:", error);
      },
    );
  }, []);

  const resetFormAppunto = () => {
    setTestoAppunto("");
    setAppuntoInModifica(null);
  };

  const salvaAppunto = async () => {
    const testoPulito = testoAppunto.trim();

    if (!testoPulito) {
      mostraNotifica("Appunto vuoto", "Scrivi qualcosa prima di salvare.", "warning");
      return;
    }

    setSalvataggioAppunto(true);

    try {
      if (appuntoInModifica) {
        await updateDoc(doc(db, "appunti", appuntoInModifica.id), {
          testo: testoPulito,
          aggiornato: serverTimestamp(),
          aggiornato_ms: Date.now(),
        });
      } else {
        await addDoc(collection(db, "appunti"), {
          testo: testoPulito,
          risolto: false,
          creato: serverTimestamp(),
          creato_ms: Date.now(),
          aggiornato: serverTimestamp(),
          aggiornato_ms: Date.now(),
        });
      }

      resetFormAppunto();
    } catch (error) {
      console.error("Errore salvataggio appunto:", error);
      mostraNotifica("Errore", "Appunto non salvato.", "error");
    } finally {
      setSalvataggioAppunto(false);
    }
  };

  const modificaAppunto = (appunto: Appunto) => {
    setAppuntoInModifica(appunto);
    setTestoAppunto(appunto.testo || "");
  };

  const cambiaStatoAppunto = async (appunto: Appunto) => {
    try {
      await updateDoc(doc(db, "appunti", appunto.id), {
        risolto: !appunto.risolto,
        aggiornato: serverTimestamp(),
        aggiornato_ms: Date.now(),
      });
    } catch (error) {
      console.error("Errore stato appunto:", error);
      mostraNotifica("Errore", "Appunto non aggiornato.", "error");
    }
  };

  const eliminaAppunto = async (appunto: Appunto) => {
    try {
      await deleteDoc(doc(db, "appunti", appunto.id));

      if (appuntoInModifica?.id === appunto.id) {
        resetFormAppunto();
      }
    } catch (error) {
      console.error("Errore eliminazione appunto:", error);
      mostraNotifica("Errore", "Appunto non eliminato.", "error");
    }
  };

  const validaUscitaByAdmin = async (item: any) => {
    const socioId = String(item.socioId || item.id || "");

    if (!socioId) {
      mostraNotifica("Errore", "Socio non riconosciuto.", "error");
      return;
    }

    setUscitaInValidazione(socioId);

    try {
      const risultato = await chiudiUsciteNonTimbrateByAdmin(socioId);

      if (risultato.usciteChiuse === 0) {
        mostraNotifica(
          "Uscita non registrata",
          "Non ci sono uscite scadute da validare.",
          "warning",
        );
        return;
      }

      mostraNotifica(
        "Uscita validata",
        `${item.nome || ""} ${item.cognome || ""} - By Admin`,
        "success",
      );
    } catch (error) {
      console.error("Errore uscita By Admin:", error);
      mostraNotifica("Errore", "Uscita non validata.", "error");
    } finally {
      setUscitaInValidazione(null);
    }
  };

  // Listener Ingressi del Giorno (Lista)
  // Listener Ingressi del Giorno con FILTRO DOPPIONI
  useEffect(() => {
    const ingressiPerPath = new Map<string, any[]>();
    const aggiornaListaIngressi = () => {
      // Ordiniamo per orario decrescente (il più recente in alto)

      const listaCompleta = Array.from(ingressiPerPath.values())
        .flat()
        .sort((a, b) => getEventoAccessoMs(b) - getEventoAccessoMs(a));
      const ultimoStatoPerSocio = new Map();

      listaCompleta.forEach((dati) => {
        const idSocio = dati.socioId;

        if (isCardResetRecuperi(String(dati.cardId || ""))) {
          return;
        }

        if (!idSocio || ultimoStatoPerSocio.has(idSocio)) {
          return;
        }

        // Se il socio non è ancora nella mappa, lo aggiungiamo.
        // Essendo la query ordinata per 'desc', il primo che troviamo è il più recente.
        ultimoStatoPerSocio.set(idSocio, dati);
      });

      // Trasformiamo la mappa di nuovo in un array per lo stato
      setIngressiOggi(
        Array.from(ultimoStatoPerSocio.values()).filter(
          (dati) => !accessoRisultaUscito(dati),
        ),
      );
    };

    const unsubscribeList = getPercorsiData(giornoCorrente).map((percorso) => {
      const pathKey = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
      const path = collection(
        db,
        "accessi",
        percorso.anno,
        percorso.mese,
        percorso.giorno,
        "ingressi_del_giorno",
      );

      return onSnapshot(
        path,
        (snapshot) => {
          ingressiPerPath.set(
            pathKey,
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })),
          );
          aggiornaListaIngressi();
        },
        (error) => {
          console.error("Errore onSnapshot ingressi:", error);
        },
      );
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
    const scanRef = ref(dbRT, "ultimo_accesso");

    return onValue(scanRef, async (snapshot) => {
      const cardId = snapshot.val();
      const ora = Date.now();
      const cardIdPulita = String(cardId || "").trim();

      if (!cardIdPulita) return;
      if (
        lastProcessedScan.current.cardId === cardIdPulita &&
        ora - lastProcessedScan.current.time < DUPLICATE_SCAN_WINDOW_MS
      )
        return;
      lastProcessedScan.current = { cardId: cardIdPulita, time: ora };

      try {
        await set(scanRef, null); // Reset immediato scanner
        if (isCardResetRecuperi(cardIdPulita)) {
          const risultato = await eseguiResetRecuperiSettimanali();
          const usciteByAdmin = await chiudiUsciteNonTimbrateByAdmin();
          mostraNotifica(
            "Reset completato",
            `Soci aggiornati: ${risultato.sociAggiornati}. Gia aggiornati oggi: ${risultato.sociGiaAggiornati}. Uscite By Admin: ${usciteByAdmin.usciteChiuse}. Mesi scaduti rilevati: ${risultato.sociMeseScaduto}.`,
            "success",
          );
          return;
        }

        const socio = await registraIngressoSocio(cardIdPulita, ora);

        if (socio.tipoAccesso === "uscita") {
          mostraNotifica(
            "Uscita registrata",
            `${socio.nome} ${socio.cognome}`,
            "success",
          );
        } else {
          mostraNotifica(
            "Benvenuto",
            `${socio.nome} ${socio.cognome}`,
            "success",
          );
        }
      } catch (error) {
        if (error === "DUPLICATE_SCAN") {
          return;
        } else if (error === "ALREADY_IN") {
          mostraNotifica("Doppio ingresso", "Socio gia entrato oggi.", "error");
        } else if (error === "EXIT_TOO_EARLY") {
          mostraNotifica(
            "Uscita non registrata",
            "Devono passare almeno 2 minuti dall'ingresso.",
            "warning",
          );
        } else if (error === "USER_NOT_FOUND") {
          mostraNotifica("Tessera non registrata", cardIdPulita, "warning");
        } else if (error === "FREQUENCY_EXCEEDED") {
          mostraNotifica(
            "Accesso negato",
            "Frequenza settimanale superata.",
            "error",
          );
        } else if (error === "Mese scaduto") {
          mostraNotifica(
            "Mese scaduto",
            "Ingresso registrato. Sistemare il pagamento.",
            "warning",
          );
        } else if (error === "RESET_NOT_FRIDAY") {
          mostraNotifica(
            "Reset non disponibile",
            "La card di reset funziona solo il venerdi.",
            "warning",
          );
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
        <TouchableOpacity
          style={styles.notesButton}
          onPress={() => setAppuntiVisibili(true)}
        >
          <Ionicons name="document-text-outline" size={18} color="#e7bc83" />
          <Text style={styles.notesButtonText}>Appunti</Text>
          {appuntiAperti.length > 0 && (
            <View style={styles.notesBadge}>
              <Text style={styles.notesBadgeText}>{appuntiAperti.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {notificaAccesso && (
        <View
          style={[
            styles.notice,
            notificaAccesso.tipo === "success" && styles.noticeSuccess,
            notificaAccesso.tipo === "warning" && styles.noticeWarning,
            notificaAccesso.tipo === "error" && styles.noticeError,
          ]}
        >
          <Text style={styles.noticeTitle}>{notificaAccesso.titolo}</Text>
          <Text style={styles.noticeText}>{notificaAccesso.messaggio}</Text>
        </View>
      )}

      <Modal
        visible={appuntiVisibili}
        transparent
        animationType="fade"
        onRequestClose={() => setAppuntiVisibili(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notesModal}>
            <View style={styles.notesHeader}>
              <Text style={styles.notesTitle}>Appunti</Text>
              <TouchableOpacity
                style={styles.notesCloseButton}
                onPress={() => {
                  setAppuntiVisibili(false);
                  resetFormAppunto();
                }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Scrivi un appunto..."
              placeholderTextColor="#777"
              value={testoAppunto}
              onChangeText={setTestoAppunto}
              multiline
            />

            <View style={styles.notesActions}>
              <TouchableOpacity
                style={[
                  styles.notesSaveButton,
                  salvataggioAppunto && styles.notesButtonDisabled,
                ]}
                onPress={salvaAppunto}
                disabled={salvataggioAppunto}
              >
                <Text style={styles.notesSaveText}>
                  {appuntoInModifica ? "Salva modifica" : "Aggiungi"}
                </Text>
              </TouchableOpacity>
              {appuntoInModifica && (
                <TouchableOpacity
                  style={styles.notesCancelButton}
                  onPress={resetFormAppunto}
                >
                  <Text style={styles.notesCancelText}>Annulla</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.notesList}
              showsVerticalScrollIndicator={false}
            >
              {appunti.length === 0 ? (
                <Text style={styles.notesEmpty}>Nessun appunto.</Text>
              ) : (
                appunti.map((appunto) => (
                  <View
                    key={appunto.id}
                    style={[
                      styles.noteRow,
                      appunto.risolto && styles.noteRowDone,
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.noteStatusButton}
                      onPress={() => cambiaStatoAppunto(appunto)}
                    >
                      <Ionicons
                        name={
                          appunto.risolto
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={22}
                        color={appunto.risolto ? "#459E7B" : "#e7bc83"}
                      />
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.noteText,
                        appunto.risolto && styles.noteTextDone,
                      ]}
                    >
                      {appunto.testo}
                    </Text>
                    <TouchableOpacity
                      style={styles.noteIconButton}
                      onPress={() => modificaAppunto(appunto)}
                    >
                      <Ionicons
                        name="create-outline"
                        size={19}
                        color="#64def3"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noteIconButton}
                      onPress={() => eliminaAppunto(appunto)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={19}
                        color="#ff7b8a"
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.infoContainer}>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>
            PRESENTI {"\n"} {ingressiOggi.length}
          </Text>
          <Ionicons name="log-in-outline" size={30} color={"#459E7B"} />
        </View>
        <View style={styles.blocco}>
          <Text style={styles.textinfo}>
            ISCRITTI {"\n"} {numeroIscritti}
          </Text>
          <Ionicons name="people-outline" size={30} color={"#A77BFF"} />
        </View>
      </View>

      <View style={styles.listWrapper}>
        <View style={styles.headerLista}>
          <Ionicons name="timer-outline" size={24} color="#5CB4EA" />
          <Text style={styles.listTitle}>Presenti</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {ingressiOggi.map((item) => {
            const uscitaNonTimbrata = isUscitaNonTimbrataScaduta(
              item,
              oraCorrenteMs,
            );
            const socioId = String(item.socioId || item.id || "");

            return (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  uscitaNonTimbrata && styles.itemRowLateExit,
                ]}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={24}
                  color={uscitaNonTimbrata ? "#ff5c7a" : "#64def3"}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={[
                      styles.itemText,
                      uscitaNonTimbrata && styles.itemTextLateExit,
                    ]}
                  >
                    {item.nome} {item.cognome}
                    {uscitaNonTimbrata ? " (uscita non timbrata)" : ""}
                  </Text>
                </View>
                {uscitaNonTimbrata ? (
                  <TouchableOpacity
                    style={[
                      styles.adminExitButton,
                      uscitaInValidazione === socioId &&
                        styles.adminExitButtonDisabled,
                    ]}
                    onPress={() => validaUscitaByAdmin(item)}
                    disabled={uscitaInValidazione === socioId}
                  >
                    <Text style={styles.adminExitButtonText}>
                      {uscitaInValidazione === socioId
                        ? "Valido..."
                        : "Valida uscita"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.itemTextTime}>
                    {item.ingresso
                      ?.toDate()
                      .toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// --- 3. STILI ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
    alignItems: "center",
    paddingTop: 60,
  },
  header: { alignItems: "center", marginBottom: 30 },
  text: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  textSub: { fontSize: 16, color: "#aaa", marginTop: 5 },
  notesButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1C24",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 7,
  },
  notesButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  notesBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ff5c7a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  notesBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  notice: {
    width: "92%",
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  noticeSuccess: { backgroundColor: "#163328", borderLeftColor: "#459E7B" },
  noticeWarning: { backgroundColor: "#352a19", borderLeftColor: "#e7bc83" },
  noticeError: { backgroundColor: "#3a1d24", borderLeftColor: "#ff5c7a" },
  noticeTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  noticeText: { color: "#ddd", fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  notesModal: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "82%",
    backgroundColor: "#1A1C24",
    borderRadius: 18,
    padding: 18,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  notesTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  notesCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#252833",
    alignItems: "center",
    justifyContent: "center",
  },
  notesInput: {
    minHeight: 82,
    maxHeight: 130,
    backgroundColor: "#252833",
    borderRadius: 12,
    color: "#fff",
    padding: 12,
    textAlignVertical: "top",
    fontSize: 15,
  },
  notesActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  notesSaveButton: {
    flex: 1,
    backgroundColor: "#459E7B",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  notesButtonDisabled: { opacity: 0.6 },
  notesSaveText: { color: "#fff", fontWeight: "900" },
  notesCancelButton: {
    backgroundColor: "#333",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  notesCancelText: { color: "#fff", fontWeight: "800" },
  notesList: { marginTop: 14 },
  notesEmpty: { color: "#aaa", textAlign: "center", paddingVertical: 18 },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252833",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noteRowDone: { opacity: 0.62 },
  noteStatusButton: { marginRight: 10 },
  noteText: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    lineHeight: 19,
  },
  noteTextDone: { color: "#aaa", textDecorationLine: "line-through" },
  noteIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  infoContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 15,
  },
  blocco: {
    flexDirection: "row",
    backgroundColor: "#1A1C24",
    justifyContent: "space-between",
    alignItems: "center",
    width: "46%",
    padding: 20,
    borderRadius: 20,
  },
  textinfo: { color: "#fff", fontSize: 16, fontWeight: "bold", lineHeight: 22 },
  listWrapper: {
    flex: 1,
    width: "92%",
    backgroundColor: "#1A1C24",
    marginTop: 40,
    borderRadius: 25,
    padding: 20,
    marginBottom: 20,
  },
  headerLista: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  listTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252833",
    padding: 15,
    borderRadius: 15,
    marginBottom: 12,
  },
  itemRowLateExit: {
    backgroundColor: "#3a1d24",
    borderWidth: 1,
    borderColor: "#ff5c7a",
  },
  itemText: { color: "#fff", fontSize: 16 },
  itemTextLateExit: { color: "#ff8a9b", fontWeight: "900" },
  itemTextTime: { color: "#aaa", fontSize: 14 },
  adminExitButton: {
    backgroundColor: "#ff5c7a",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 8,
  },
  adminExitButtonDisabled: { opacity: 0.6 },
  adminExitButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});
