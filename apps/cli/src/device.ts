import { parseArgs } from 'node:util';
import {
  addDevice,
  DEVICE_PRESETS,
  findUserId,
  listDevices,
  removeDevice,
  shortDeviceId,
  type AddDeviceInput,
} from '@perch/core';
import { createDb } from '@perch/db';
import { userEmail } from './commands.js';

const USAGE = `usage: perch device add <preset-id|pc> [--default] [--gpu "<name>" --cpu "<name>" --ram <gb> --name N]
       perch device list
       perch device rm <id>
presets: ${DEVICE_PRESETS.map((p) => p.id).join(', ')}`;

/** `perch device add|list|rm`. */
export async function deviceCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const [sub, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      user: { type: 'string' },
      default: { type: 'boolean' },
      gpu: { type: 'string' },
      cpu: { type: 'string' },
      ram: { type: 'string' },
      name: { type: 'string' },
    },
  });
  if (sub !== 'add' && sub !== 'list' && sub !== 'rm') throw new Error(USAGE);
  const email = userEmail(values.user);

  const db = createDb(dbUrl());
  try {
    const userId = await findUserId(db, email);
    if (sub === 'list') {
      const rows = await listDevices(db, userId);
      if (rows.length === 0) return void console.log('no devices (perch device add <preset|pc>)');
      for (const d of rows) {
        const hw = d.gpuName
          ? `  gpu ${d.gpuName} (${d.gpuScore}), cpu ${d.cpuName} (${d.cpuScore}), ${d.ramGb} GB`
          : '';
        console.log(
          `${shortDeviceId(d.id)}  ${d.kind}  ${d.name}${d.isDefault ? ' [default]' : ''}${hw}`,
        );
      }
    } else if (sub === 'rm') {
      const id = positionals[0];
      if (!id) throw new Error('usage: perch device rm <id>');
      await removeDevice(db, userId, id);
      console.log(`removed ${id}`);
    } else {
      const target = positionals[0];
      if (!target) throw new Error(USAGE);
      let input: AddDeviceInput;
      if (target === 'pc') {
        const { gpu, cpu, ram } = values;
        if (!gpu || !cpu || !ram)
          throw new Error('pc needs --gpu "<name>" --cpu "<name>" --ram <gb>');
        input = {
          pc: { gpu, cpu, ramGb: Number(ram), name: values.name },
          isDefault: values.default,
        };
      } else {
        input = { preset: target, isDefault: values.default };
      }
      const d = await addDevice(db, userId, input);
      console.log(`added ${d.name} (${shortDeviceId(d.id)})${d.isDefault ? ' [default]' : ''}`);
    }
  } finally {
    await db.$client.end();
  }
}
