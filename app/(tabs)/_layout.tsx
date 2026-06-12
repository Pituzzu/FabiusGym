import { Tabs } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [giornoCorrente, setGiornoCorrente] = useState(getOggiFormatoIT());
  const [personeAlertGiorno, setPersoneAlertGiorno] = useState<string[]>([]);
  const [personeMeseScaduto, setPersoneMeseScaduto] = useState<string[]>([]);
  const numeroPersoneAlert = useMemo(() => (
    new Set([...personeAlertGiorno, ...personeMeseScaduto]).size
  ), [personeAlertGiorno, personeMeseScaduto]);

  useEffect(() => {
    const aggiornaGiorno = () => setGiornoCorrente(getOggiFormatoIT());
    const timer = setInterval(aggiornaGiorno, 60000);

    aggiornaGiorno();

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const personePerPath = new Map<string, string[]>();
    const aggiornaBadgeAlert = () => {
      setPersoneAlertGiorno(Array.from(new Set(Array.from(personePerPath.values()).flat())));
    };

    const unsubscribeList = getPercorsiData(giornoCorrente).map((percorso) => {
      const pathKey = `${percorso.anno}/${percorso.mese}/${percorso.giorno}`;
      const colRef = collection(db, 'anomalie', percorso.anno, percorso.mese, percorso.giorno, 'eventi');

      return onSnapshot(colRef, (snapshot) => {
        personePerPath.set(pathKey, snapshot.docs.map((doc) => {
          const dati = doc.data();
          return String(dati.socioId || dati.cardId || doc.id);
        }));
        aggiornaBadgeAlert();
      }, (error) => {
        console.error("Errore badge alert anomalie:", error);
      });
    });

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [giornoCorrente]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'soci'), (snapshot) => {
      const oggiNum = dataToNum(giornoCorrente);
      const personeScadute: string[] = [];

      snapshot.forEach((doc) => {
        const dati = doc.data();
        const alertMeseScadutoRimosso = dati.alert_mese_scaduto_rimosso_scadenza === dati.dataScadenza;

        if (dati.dataScadenza && oggiNum > dataToNum(dati.dataScadenza) && !alertMeseScadutoRimosso) {
          personeScadute.push(doc.id);
        }
      });

      setPersoneMeseScaduto(personeScadute);
    }, (error) => {
      console.error("Errore badge alert soci:", error);
    });

    return () => unsubscribe();
  }, [giornoCorrente]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'dark'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle:{
          backgroundColor: '#171717',
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="iscritti"
        options={{
          title: 'Iscritti',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-sharp" size={size} color={color} />
          ),
        }}
      />


      <Tabs.Screen
        name="alert"
        options={{
          title: 'Alert',
          tabBarBadge: numeroPersoneAlert > 0 ? numeroPersoneAlert : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ff5c7a',
            color: '#fff',
            fontWeight: '800',
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-sharp" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="setting"
        options={{
          title: 'Ingressi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="enter-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
