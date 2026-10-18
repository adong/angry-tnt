/* Claude Games kit: the characters every game can use. Load after people.js. Exposes window.Kit.roster.
   Each entry: id, name, look (passed to Kit.people.build), plus optional
     pose        - pose for menu portraits (Kit.portraits)
     signature   - pose names for celebrations, in order: hello first, goodbye last
     buddyScale  - size when he runs alongside another character as a buddy
     tag         - name-tag colour when he's a buddy
     scare       - the zombie: games may play a (harmless) scare when he's picked
   To add someone (say, Dad), copy an entry, give it a new id and change the colours and styles. Styles are listed
   at Kit.people.build in people.js. */
(function () {
  'use strict';
  const Kit = window.Kit;

  const list = [
    {
      // Modelled on his photo: black spiky hair, big grin, blue brick-wall tee, red sneakers.
      id: 'teddy',
      name: 'TEDDY',
      signature: ['boxing', 'jumpshot'], // Mike Tyson-style jab + straight, and a basketball jump shot
      buddyScale: 0.85,
      tag: '#8cc2ff',
      look: {
        head: 'human', skin: '#efc29c', hair: 'spiky', hairColor: '#16130f', brows: true, smile: true,
        shirt: 'tee', top: '#4a86cf', print: 'bricks', bottom: '#2b3140', shoes: '#e53935',
      },
    },
    {
      // Modelled on his photo: short black hair, mint UFO-and-dinosaur tee, cream joggers.
      id: 'tommy',
      name: 'TOMMY',
      pose: 'peace',
      signature: ['peace'], // his favourite: both arms up in a Y with peace fingers (比耶)
      buddyScale: 0.72,
      tag: '#ffb02e',
      look: {
        head: 'human', skin: '#efc6a2', hair: 'short', hairColor: '#15120e', brows: true, peace: true,
        shirt: 'tee', top: '#c3d6cf', print: 'ufo', bottom: '#e6dfd0', shoes: '#2f4a7a',
      },
    },
    {
      id: 'zoom',
      name: 'ZOOM',
      look: {
        head: 'human', skin: '#f2c49c', hair: 'short', hairColor: '#4a2f1d', hat: 'capBack', hatColor: '#18b4ff',
        shirt: 'hoodie', top: '#ff3d7f', print: 'bolt', bottom: '#2d5fb8', shoes: '#ffd400',
        pack: '#ffb02e', packPocket: '#18b4ff', headphones: '#22212a',
      },
    },
    {
      id: 'luna',
      name: 'LUNA',
      look: {
        head: 'human', skin: '#b27a52', hair: 'ponytail', hairColor: '#2a1a12', brows: true, smile: true,
        shirt: 'hoodie', top: '#8d5bd8', print: 'star', bottom: '#20232e', shoes: '#f4f4f4', pack: '#18d4ff',
      },
    },
    {
      id: 'bolt',
      name: 'BOLT',
      look: {
        head: 'robot', skin: '#e6eaef', eyes: '#5ef2ff',
        shirt: 'jacket', top: '#ff8a1f', print: 'panel', bottom: '#5a5f6b', shoes: '#2a2a30',
      },
    },
    {
      id: 'bruno',
      name: 'BRUNO',
      look: {
        head: 'bear', skin: '#8b5a2b', muzzle: '#d9b48a',
        shirt: 'hoodie', top: '#2fb36a', print: 'paw', bottom: '#2b3a63', shorts: true, shoes: '#ff3d7f',
      },
    },
    {
      // Tommy's idea: a cartoon zombie (spooky, not gory). Picking him can trigger a harmless scare.
      id: 'zombie',
      name: 'ZOMBIE',
      scare: true,
      look: {
        head: 'human', zombie: true, skin: '#8fbf6a', hair: 'short', hairColor: '#2b2f22',
        shirt: 'tee', top: '#6d5a8c', print: 'torn', bottom: '#4a4038', shorts: true, shoes: '#5b4636',
      },
    },
  ];

  const get = (id) => list.find((c) => c.id === id) || null;

  // The buddy who comes along: the other brother. Tommy joins everyone except himself, when Teddy comes instead.
  const buddyFor = (id) => (id === 'tommy' ? 'teddy' : 'tommy');

  // Celebration pose for a character: signature[0] says hello, the last one says goodbye.
  const signature = (c, which = 'hello') => {
    const sig = (c && c.signature) || ['wave'];
    return which === 'goodbye' ? sig[sig.length - 1] : sig[0];
  };

  Kit.roster = { list, get, buddyFor, signature };
})();
