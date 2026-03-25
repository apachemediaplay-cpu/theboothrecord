import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, phone, email, venue, message } = await req.json();

    if (!name || !phone || !email || !venue) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailHtml = `
      <div style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 30px; background: #1a1512; color: #e8e4df;">
        <h1 style="font-size: 18px; letter-spacing: 0.2em; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 25px;">
          New Contact Submission
        </h1>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">Name</td><td style="padding: 8px 0; color: #e8e4df;">${name}</td></tr>
          <tr><td style="padding: 8px 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">Phone</td><td style="padding: 8px 0; color: #e8e4df;">${phone}</td></tr>
          <tr><td style="padding: 8px 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">Email</td><td style="padding: 8px 0; color: #e8e4df;"><a href="mailto:${email}" style="color: #e8e4df;">${email}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">Venue</td><td style="padding: 8px 0; color: #e8e4df;">${venue}</td></tr>
          ${message ? `<tr><td style="padding: 8px 0; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;">Message</td><td style="padding: 8px 0; color: #e8e4df;">${message}</td></tr>` : ''}
        </table>
        <p style="margin-top: 30px; font-size: 10px; color: #555; letter-spacing: 0.1em;">Sent from GUILTY contact form</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'GUILTY Contact <onboarding@resend.dev>',
        to: ['trade@houseofguilty.com'],
        subject: `New Contact: ${name} — ${venue}`,
        html: emailHtml,
        reply_to: email,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend error:', data);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
