import '@/assets/css/main.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('popup root element #app not found');
}
app.innerHTML = `
  <main class="min-w-80 bg-bg p-4 text-fg">
    <h1 class="text-lg font-bold text-primary">autograph</h1>
    <p class="mt-2 text-sm text-fg-subtle">NIP-07 signer — under construction.</p>
  </main>
`;
