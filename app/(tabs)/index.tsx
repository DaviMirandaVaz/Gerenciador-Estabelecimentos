import Button from "@/Components/Button";
import DropdownComponent from "@/Components/Dropdown";
import ModalMenu from "@/Components/Modal";

import * as ImagePicker from 'expo-image-picker';

import { useState } from "react";

import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import ImageViewer from "../../Components/ImageViewer";

const placeholderImage = require("../../assets/images/icon.png");

export default function Index() {

  const data = [
    { label: 'Rosa', value: '#3B1F2B' },
    { label: 'Azul', value: '#1E3A5F' },
    { label: 'Verde', value: '#1F3B2D' },
    { label: 'Branco', value: '#374151' },
    { label: 'Cinza', value: '#1F2937' },
  ];

  const [selectedImage, setSelectedImage] =
    useState<string | undefined>(undefined);

  const [isModalVisible, setIsModalVisible] =
    useState<boolean>(false);

  const backgroundColor =
    useSharedValue("#111827");

  const changeBackgroundColor = (color: string) => {
    backgroundColor.value = color;
  };

  const pickImageAsync = async () => {

    let result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const animatedStyles = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      backgroundColor.value,
      { duration: 400 }
    ),
  }));

  return (

    <Animated.View
      style={[styles.container, animatedStyles]}
    >

      <Text style={styles.title}>
        Cloud Notes
      </Text>

      <Text style={styles.subtitle}>
        Suas imagens e tarefas em um só lugar
      </Text>

      <View style={styles.imageContainer}>
        <ImageViewer
          imgSource={selectedImage || placeholderImage}
        />
      </View>

      <View style={styles.footerContainer}>

        <Button
          onPress={pickImageAsync}
          label="Escolher imagem"
          theme="primary"
        />

        <Button
          onPress={() => setIsModalVisible(true)}
          label="Abrir configurações"
        />

      </View>

      <ModalMenu
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
      >

        <View style={styles.modalContent}>

          <Text style={styles.modalTitle}>
            Personalização
          </Text>

          <DropdownComponent
            data={data}
            saveAt="backgroundColor"
            onChoose={(color) =>
              changeBackgroundColor(color)
            }
          />

        </View>

      </ModalMenu>

    </Animated.View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    marginBottom: 32,
    textAlign: "center",
  },

  imageContainer: {
    width: 280,
    height: 280,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 40,
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
  },

  footerContainer: {
    width: "100%",
    gap: 16,
    alignItems: "center",
  },

  modalContent: {
    padding: 20,
  },

  modalTitle: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 18,
  },
});