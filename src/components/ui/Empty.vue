<script setup lang="ts">
defineProps<{ description: string }>();
</script>

<template>
  <div class="text-faint py-8 text-center text-xs">{{ description }}</div>
</template>
