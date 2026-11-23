import {
  StyleSheet,
  Text,
  View
} from "react-native";

export default function AboutScreen() {

  return (

    <View style={styles.container}>

      <View style={styles.card}>

        <Text style={styles.title}>
          Sobre o App
        </Text>

        <Text style={styles.text}>
          Este aplicativo foi desenvolvido na aula de Programação de Dispositivos Móveis 
        </Text>


      </View>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
    padding: 24,
  },

  card: {
    width: "100%",
    backgroundColor: "#1F2937",
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: "#374151",
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 20,
  },

  text: {
    color: "#D1D5DB",
    fontSize: 16,
    lineHeight: 28,
    marginBottom: 16,
  },
});