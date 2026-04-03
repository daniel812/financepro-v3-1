
import { GoogleGenAI, Type } from "@google/genai";

export interface FinancialInsight {
  summary: string;
  recommendations: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Generates financial insights using Gemini.
 */
export async function getFinancialInsights(summaryData: any): Promise<FinancialInsight> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analiza este resumen financiero mensual y ofrece consejos estratégicos: ${JSON.stringify(summaryData)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { 
              type: Type.STRING, 
              description: 'Un resumen conciso de 2 frases sobre la salud financiera.' 
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 consejos accionables específicos basados en los números proporcionados.'
            },
            riskLevel: {
              type: Type.STRING,
              description: 'Nivel de riesgo del presupuesto: LOW (Bajo), MEDIUM (Medio), o HIGH (Alto).'
            }
          },
          required: ["summary", "recommendations", "riskLevel"]
        },
        systemInstruction: "Eres un asesor financiero experto. Recibirás un resumen del presupuesto familiar, ingresos y gastos. Proporciona ideas expertas basadas en datos. Sé alentador pero directo sobre el exceso de gastos. Usa la moneda COP. Responde siempre en español."
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Respuesta vacía de la IA");
    }
    
    return JSON.parse(text.trim());
  } catch (error: any) {
    console.error("Detalles del error de Gemini API:", error);
    return {
      summary: "Estamos teniendo problemas para conectar con el Asesor IA. Esto suele ocurrir si la clave API es inválida o el formato de los datos es inesperado.",
      recommendations: [
        "Asegúrate de que tus gastos no superen el 90% de tus ingresos.",
        "Revisa primero las categorías con 0 de presupuesto restante.",
        "Verifica tu conexión a internet e inténtalo de nuevo."
      ],
      riskLevel: 'MEDIUM'
    };
  }
}
