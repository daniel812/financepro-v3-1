import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.API_KEY!);

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, replyMarkup?: object) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  });
}

// ─── Session persistence in Supabase ────────────────────────────────────────

type SessionData = {
  amount: number;
  description: string;
  userId: string;
  familyAdminId: string;
  category_id?: string;
  category_name?: string;
  payment_method_id?: string;
  payment_method_name?: string;
};

async function getSession(chatId: number): Promise<{ step: string; data: SessionData } | null> {
  const { data } = await supabase
    .from('bot_sessions')
    .select('step, data')
    .eq('chat_id', chatId)
    .single();
  return data as { step: string; data: SessionData } | null;
}

async function setSession(chatId: number, step: string, data: SessionData) {
  await supabase
    .from('bot_sessions')
    .upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' });
}

async function clearSession(chatId: number) {
  await supabase.from('bot_sessions').delete().eq('chat_id', chatId);
}

// ─── /start handler ──────────────────────────────────────────────────────────

async function handleStart(chatId: number, linkToken?: string) {
  if (!linkToken) {
    await sendMessage(chatId, '¡Hola! Soy tu asistente de FinancePro.\nUsa el botón *Vincular Telegram* en Ajustes para conectar tu cuenta.');
    return;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: chatId.toString() })
    .eq('id', linkToken)
    .select('full_name')
    .single();

  if (error || !profile) {
    await sendMessage(chatId, '❌ Error vinculando tu cuenta. Asegúrate de usar el enlace correcto desde la web.');
  } else {
    await sendMessage(chatId, `✅ ¡Hola ${profile.full_name}! Tu cuenta ha sido vinculada.\nYa puedes registrar gastos escribiéndolos aquí.`);
  }
}

// ─── Expense text handler ────────────────────────────────────────────────────

async function handleExpenseText(chatId: number, text: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, family_admin_id')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (!profile) {
    await sendMessage(chatId, '⚠️ Tu cuenta no está vinculada. Ve a *Ajustes* en FinancePro para obtener tu enlace.');
    return;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(
    `Extrae el monto de dinero y la descripción de un gasto del siguiente texto en español: "${text}". ` +
    `Responde ÚNICAMENTE con un objeto JSON: {"amount": número, "description": "texto"}. ` +
    `Si no es un gasto válido, responde: {"error": "no_expense"}.`
  );

  const raw = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  if (parsed.error) {
    await sendMessage(chatId, 'No entendí eso como un gasto. Prueba algo como:\n*Gasolina 50000* o *Almuerzo 12000*');
    return;
  }

  const adminId = profile.family_admin_id || profile.id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', adminId)
    .eq('is_active', true)
    .not('parent_id', 'is', null);

  if (!categories?.length) {
    await sendMessage(chatId, '⚠️ No hay categorías activas. Configúralas en Ajustes.');
    return;
  }

  await setSession(chatId, 'WAITING_CATEGORY', {
    amount: parsed.amount,
    description: parsed.description,
    userId: profile.id,
    familyAdminId: adminId,
  });

  const keyboard = {
    inline_keyboard: categories.slice(0, 8).map((c) => [{ text: c.name, callback_data: `cat_${c.id}` }]),
  };

  await sendMessage(
    chatId,
    `💰 *Gasto detectado*\nMonto: $${parsed.amount.toLocaleString('es-CO')}\nDetalle: _${parsed.description}_\n\n📂 Selecciona una categoría:`,
    keyboard
  );
}

// ─── Callback handler ────────────────────────────────────────────────────────

async function handleCallback(chatId: number, callbackData: string) {
  // cancel — no need to load session
  if (callbackData === 'cancel_entry') {
    await clearSession(chatId);
    await sendMessage(chatId, 'Entrada descartada. ✌️');
    return;
  }

  const session = await getSession(chatId);
  if (!session) {
    await sendMessage(chatId, 'Sesión expirada. Por favor envía el gasto de nuevo.');
    return;
  }

  if (callbackData.startsWith('cat_')) {
    const categoryId = callbackData.slice(4);
    const { data: category } = await supabase.from('categories').select('name').eq('id', categoryId).single();
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('user_id', session.data.familyAdminId)
      .eq('is_active', true);

    if (!methods?.length) {
      await sendMessage(chatId, '⚠️ No hay métodos de pago activos. Configúralos en Ajustes.');
      return;
    }

    await setSession(chatId, 'WAITING_METHOD', {
      ...session.data,
      category_id: categoryId,
      category_name: category?.name,
    });

    const keyboard = {
      inline_keyboard: methods.map((p) => [{ text: p.name, callback_data: `pm_${p.id}` }]),
    };
    await sendMessage(chatId, `Categoría: *${category?.name}*\n\n💳 ¿Con qué pagaste?`, keyboard);
    return;
  }

  if (callbackData.startsWith('pm_')) {
    const methodId = callbackData.slice(3);
    const { data: method } = await supabase.from('payment_methods').select('name').eq('id', methodId).single();

    await setSession(chatId, 'CONFIRMING', {
      ...session.data,
      payment_method_id: methodId,
      payment_method_name: method?.name,
    });

    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Confirmar y Guardar', callback_data: 'confirm_save' },
        { text: '❌ Cancelar', callback_data: 'cancel_entry' },
      ]],
    };

    await sendMessage(
      chatId,
      `*Resumen del Gasto*\n` +
      `💵 $${session.data.amount.toLocaleString('es-CO')}\n` +
      `📝 ${session.data.description}\n` +
      `📂 ${session.data.category_name}\n` +
      `💳 ${method?.name}\n\n` +
      `¿Registrar ahora?`,
      keyboard
    );
    return;
  }

  if (callbackData === 'confirm_save') {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.data.userId).single();
    const status = profile?.role === 'ADMIN' ? 'APPROVED' : 'PENDING_APPROVAL';

    const { error } = await supabase.from('expenses').insert([{
      date: new Date().toISOString().split('T')[0],
      description: session.data.description,
      amount: session.data.amount,
      category_id: session.data.category_id,
      payment_method_id: session.data.payment_method_id,
      user_id: session.data.userId,
      status,
    }]);

    if (error) {
      console.error('Error insertando gasto:', error);
      await sendMessage(chatId, '❌ Error al guardar el gasto. Intenta de nuevo.');
    } else {
      await clearSession(chatId);
      await sendMessage(chatId, '✅ ¡Gasto registrado exitosamente en FinancePro!');
    }
    return;
  }
}

// ─── Main handler (Vercel Serverless Function) ───────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const { message, callback_query } = req.body || {};

  try {
    if (callback_query) {
      await handleCallback(callback_query.message.chat.id, callback_query.data);
    } else if (message?.text) {
      const chatId: number = message.chat.id;
      const text: string = message.text;

      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        await handleStart(chatId, parts[1]);
      } else {
        await handleExpenseText(chatId, text);
      }
    }
  } catch (err) {
    console.error('Bot error:', err);
  }

  // Respond only after all processing is done — Vercel kills network calls after res.end()
  return res.status(200).json({ ok: true });
}
