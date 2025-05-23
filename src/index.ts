import joplin from 'api';
import * as CryptoJS from 'crypto-js';

joplin.plugins.register({
  onStart: async function () {
    await joplin.commands.register({
      name: 'decryptSelectedText',
      label: 'Decrypt selected text (ENEX)',
      execute: async () => {
        const selectedText = (await joplin.commands.execute('selectedText') || '').trim();
        if (!selectedText) {
          alert('Please select encrypted text first.');
          return;
        }

        const passwordsRaw = await joplin.views.dialogs.showMessageBox('Enter passwords separated by commas:', {
          input: {
            label: 'Passwords (comma-separated)',
            value: '',
          },
          buttons: ['Decrypt', 'Cancel']
        });

        if (passwordsRaw.id !== 0 || !passwordsRaw.formData.input) {
          return;
        }

        const passwords = passwordsRaw.formData.input.split(',').map((p: string) => p.trim());

        try {
          const data = CryptoJS.enc.Base64.parse(selectedText);
          const bytes = CryptoJS.enc.Hex.stringify(data);

          const salt = CryptoJS.enc.Hex.parse(bytes.substr(8, 32));
          const salthmac = CryptoJS.enc.Hex.parse(bytes.substr(40, 32));
          const iv = CryptoJS.enc.Hex.parse(bytes.substr(72, 32));
          const ciphertext = CryptoJS.enc.Hex.parse(bytes.substr(104, bytes.length - 168));
          const body = CryptoJS.enc.Hex.parse(bytes.substr(0, bytes.length - 64));
          const bodyhmac = bytes.substr(-64);

          let plaintext = 'Decryption failed! Wrong passwords or corrupted data.';

          for (const password of passwords) {
            const keyhmac = CryptoJS.PBKDF2(password, salthmac, { keySize: 128/32, iterations: 50000, hasher: CryptoJS.algo.SHA256 });
            const testhmac = CryptoJS.HmacSHA256(body, keyhmac).toString();

            if (testhmac === bodyhmac) {
              const key = CryptoJS.PBKDF2(password, salt, { keySize: 128/32, iterations: 50000, hasher: CryptoJS.algo.SHA256 });
              const decrypted = CryptoJS.AES.decrypt(
                { ciphertext: ciphertext } as CryptoJS.lib.CipherParams,
                key,
                { iv: iv, mode: CryptoJS.mode.CBC }
              );
              plaintext = decrypted.toString(CryptoJS.enc.Utf8);
              plaintext = plaintext.replace(/[\x00-\x1F\x7F]/g, '');
              break;
            }
          }

          await joplin.commands.execute('replaceSelection', plaintext);

        } catch (error: any) {
          await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
        }
      }
    });

    await joplin.views.menuItems.create('decryptSelectedTextMenu', 'decryptSelectedText', joplin.views.menuItems.MenuItemLocation.EditorContextMenu);
  },
});
