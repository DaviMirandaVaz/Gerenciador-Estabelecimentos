import { Link, Stack } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>

        <View style={styles.header}>
          <Image
            source={require("../assets/images/error.png")}
            style={styles.errorImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.content}>
          <Image
            source={require("../assets/images/warning.png")}
            style={styles.warningImage}
            resizeMode="contain"
          />

          <Text style={styles.text}>
            Página Não Encontrada
          </Text>

          <Link href="/" style={styles.link}>
            Retornar para página inicial
          </Link>
        </View>

      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E5E5E5",
  },

  header: {
    height: 70,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  errorImage: {
    width: 180,
    height: 50,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  warningImage: {
    width: 180,
    height: 180,
    marginBottom: 20,
  },

  text: {
    fontSize: 24,
    color: "#222",
    marginBottom: 20,
  },

  link: {
    color: "#0066CC",
    textDecorationLine: "underline",
    fontSize: 16,
  },
});