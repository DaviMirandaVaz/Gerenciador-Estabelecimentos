import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SQLiteProvider } from 'expo-sqlite';
import { migrateDbIfNeeded } from './database';
import { useFonts } from 'expo-font';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const styleId = 'vector-icons-web-fix';
  if (!document.getElementById(styleId)) {
    // Detecta o protocolo correto (Electron usa 'app://', web usa '//')
    const isElectron = typeof window !== 'undefined' && window.location.protocol === 'app:';
    const baseUrl = isElectron ? 'app://local' : '';
    const fontsBase = `${baseUrl}/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts`;

    // Hashes dos arquivos de fonte compilados pelo Expo
    const ioniconsHash = 'b4eb097d35f44ed943676fd56f6bdc51';
    const fontAwesomeHash = 'b06871f281fee6b241d60582ae9369b9';
    const materialIconsHash = '4e85bc9ebe07e0340c9c4fc2f6c38908';
    const materialCommunityHash = '6e435534bd35da5fef04168860a9b8fa';
    const antDesignHash = '3f78af31cca60105799838a1a7a59fbd';
    const featherHash = 'ca4b48e04dc1ce10bfbddb262c8b835f';
    const entypoHash = '31b5ffea3daddc69dd01a1f3d6cf63c5';

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @font-face { font-family: "Ionicons"; src: url("${fontsBase}/Ionicons.${ioniconsHash}.ttf") format("truetype"), url("${fontsBase}/Ionicons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "ionicons"; src: url("${fontsBase}/Ionicons.${ioniconsHash}.ttf") format("truetype"), url("${fontsBase}/Ionicons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "FontAwesome"; src: url("${fontsBase}/FontAwesome.${fontAwesomeHash}.ttf") format("truetype"), url("${fontsBase}/FontAwesome.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "fontawesome"; src: url("${fontsBase}/FontAwesome.${fontAwesomeHash}.ttf") format("truetype"), url("${fontsBase}/FontAwesome.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "MaterialIcons"; src: url("${fontsBase}/MaterialIcons.${materialIconsHash}.ttf") format("truetype"), url("${fontsBase}/MaterialIcons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "Material Icons"; src: url("${fontsBase}/MaterialIcons.${materialIconsHash}.ttf") format("truetype"), url("${fontsBase}/MaterialIcons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "material"; src: url("${fontsBase}/MaterialIcons.${materialIconsHash}.ttf") format("truetype"), url("${fontsBase}/MaterialIcons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "MaterialCommunityIcons"; src: url("${fontsBase}/MaterialCommunityIcons.${materialCommunityHash}.ttf") format("truetype"), url("${fontsBase}/MaterialCommunityIcons.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "AntDesign"; src: url("${fontsBase}/AntDesign.${antDesignHash}.ttf") format("truetype"), url("${fontsBase}/AntDesign.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "Feather"; src: url("${fontsBase}/Feather.${featherHash}.ttf") format("truetype"), url("${fontsBase}/Feather.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "Entypo"; src: url("${fontsBase}/Entypo.${entypoHash}.ttf") format("truetype"), url("${fontsBase}/Entypo.ttf") format("truetype"); font-display: block; }
    `;
    document.head.appendChild(style);
  }
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    FontAwesome: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf'),
    fontawesome: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf'),
    MaterialIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
    'Material Icons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
    material: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
    MaterialCommunityIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
    AntDesign: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf'),
    Feather: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf'),
    Entypo: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Entypo.ttf'),
  });

  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1F2937' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light"/>
      <SQLiteProvider databaseName="pdv_local.db" onInit={migrateDbIfNeeded}>
        <Stack screenOptions={{
          headerShadowVisible: false,
          headerTintColor: '#fff',
          headerStyle: {
            backgroundColor: '#214067'
          },
        }}>
          <Stack.Screen name="index" options={{
            headerShown: false,
          }}/>
          <Stack.Screen name="(drawer)" options={{
            headerShown: false,
          }}/>
          <Stack.Screen name="+not-found"/>
        </Stack>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

