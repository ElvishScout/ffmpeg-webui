<script setup lang="ts">
import { NConfigProvider, NMessageProvider, darkTheme } from "naive-ui";
import AppShell from "./AppShell.vue";
</script>

<template>
  <NConfigProvider :theme="darkTheme">
    <NMessageProvider>
      <AppShell />
    </NMessageProvider>
  </NConfigProvider>
</template>
