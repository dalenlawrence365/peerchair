"use client"
import { useState, useEffect } from "react"
import { sbFetch, G, BG, BG2, T } from "@/lib/appShared"

function AskClaude(props) {
  var initialQ = props.initialQ || "";
  var onQuestionConsumed = props.onQuestionConsumed;
  var QUICK = [
    "Who should I call today?",
    "Who has been stuck in Connected the longest?",
    "Who in my pipeline needs attention today?",
    "Who are my strongest fit call candidates?",
    "Who hasn't had any activity logged?",
    "Give me a status report on Ben Chavez and Sayeed Chowdhury",
    "Who should I invite to the Experience Event first?",
    "Draft a LinkedIn message inviting someone to a fit call",
  ];

  var [input, setInput]   = useState("");
  var [loading, setLoading] = useState(false);
  var [messages, setMessages] = useState([
    {role:"assistant", text:(function(){var h=new Date().getHours();var g=h<12?"Good morning":h<17?"Good afternoon":"Good evening";return g+", Dalen. I have your full pipeline loaded. Ask me anything about who to call, what to say, or what needs attention today.";})()} 
  ]);

  useEffect(function(){
    if (initialQ) { ask(initialQ); if (onQuestionConsumed) onQuestionConsumed(); }
  }, [initialQ]);

  async function ask(q) {
    var question = q || input.trim();
    if (!question) return;
    setInput("");
    setMessages(function(prev){ var next=prev.concat([{role:"user", text:question}]); return next.slice(-20); });
    setLoading(true);
    try {
      var res = await fetch("/api/ask-claude", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({question:question})
      });
      var data = await res.json();
      setMessages(function(prev){ return prev.concat([{role:"assistant", text:data.answer||data.error||"No response"}]); });
    } catch(e) {
      setMessages(function(prev){ return prev.concat([{role:"assistant", text:"Error: "+e.message}]); });
    }
    setLoading(false);
  }

  function handleKey(e) {
    if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>
      {/* Header */}
      <div style={{padding:"20px 28px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",border:"1px solid rgba(240,200,74,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>★</div>
          <h2 style={{fontSize:20,fontWeight:600,color:"#e8f2ff",margin:0}}>Ask Claude</h2>
          <span style={{fontSize:10,color:"#2ecc71",letterSpacing:2,textTransform:"uppercase",padding:"2px 8px",background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:10}}>Live Pipeline</span>
        </div>
        <div style={{fontSize:12,color:"#7a9bb8"}}>Natural language access to your full CFO Circle LA pipeline</div>
      </div>

      {/* Quick questions */}
      <div style={{padding:"12px 28px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",gap:7,flexWrap:"wrap"}}>
        {QUICK.map(function(q){
          return <button key={q} onClick={function(){ask(q);}} style={{padding:"5px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a9bb8",borderRadius:16,cursor:"pointer",fontSize:11,fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.15s"}}
            onMouseOver={function(e){e.target.style.borderColor="rgba(240,200,74,0.4)";e.target.style.color="#f0c84a";}}
            onMouseOut={function(e){e.target.style.borderColor="rgba(255,255,255,0.08)";e.target.style.color="#7a9bb8";}}
          >{q}</button>;
        })}
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 28px",display:"flex",flexDirection:"column-reverse",gap:16}}>
        {messages.slice().reverse().map(function(msg, i){
          var isUser = msg.role==="user";
          return (
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:isUser?"row-reverse":"row"}}>
              <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,
                background:isUser?"linear-gradient(135deg,#1a3a5c,#0f2235)":"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",
                border:isUser?"1px solid rgba(240,200,74,0.3)":"1px solid rgba(240,200,74,0.4)",
                color:"#f0c84a",marginTop:2}}>
                {isUser?"DL":"★"}
              </div>
              <div style={{maxWidth:"80%",background:isUser?"rgba(255,255,255,0.04)":"rgba(240,200,74,0.04)",border:"1px solid "+(isUser?"rgba(255,255,255,0.08)":"rgba(240,200,74,0.12)"),borderRadius:isUser?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"12px 16px"}}>
                <div style={{fontSize:13,color:"#d8eeff",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{msg.text}</div>
              </div>
            </div>
          );
        })}
        {loading?<div style={{display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",border:"1px solid rgba(240,200,74,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#f0c84a"}}>★</div>
          <div style={{display:"flex",gap:5,padding:"12px 16px",background:"rgba(240,200,74,0.04)",border:"1px solid rgba(240,200,74,0.12)",borderRadius:"4px 12px 12px 12px"}}>
            {[0,1,2].map(function(n){return <div key={n} style={{width:6,height:6,borderRadius:"50%",background:"#f0c84a",opacity:0.6,animation:"pulse 1s ease-in-out "+n*0.2+"s infinite"}}/>;})}
          </div>
        </div>:null}
      </div>

      {/* Input */}
      <div style={{padding:"16px 28px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",gap:10}}>
        <textarea
          value={input}
          onChange={function(e){setInput(e.target.value);}}
          onKeyDown={handleKey}
          placeholder="Ask anything about your pipeline... (Enter to send)"
          rows={2}
          style={{flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",color:"#e8f2ff",padding:"10px 14px",borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",lineHeight:1.6}}
        />
        <button onClick={function(){ask();}} disabled={loading||!input.trim()} style={{padding:"10px 18px",background:input.trim()?"rgba(240,200,74,0.15)":"rgba(255,255,255,0.03)",border:"1px solid "+(input.trim()?"rgba(240,200,74,0.4)":"rgba(255,255,255,0.08)"),color:input.trim()?"#f0c84a":"#3a5a74",borderRadius:8,cursor:input.trim()?"pointer":"default",fontSize:18,fontWeight:700,alignSelf:"stretch",minWidth:48}}>→</button>
      </div>
    </div>
  );
}


export default AskClaude
