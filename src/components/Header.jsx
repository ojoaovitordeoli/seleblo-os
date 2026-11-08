import React from 'react'

// SELEBLO V4 - identidade do projeto. Cena original preservada.
export default function Header(){
  return <div style={{position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',textAlign:'center',zIndex:20,pointerEvents:'none'}}>
    <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,letterSpacing:5,textTransform:'uppercase',color:'rgba(255,255,255,.95)',margin:0,textShadow:'0 2px 10px rgba(0,20,40,.55)'}}>
      SELEBLO <span style={{background:'linear-gradient(135deg,#0DEEF3,#448AFF)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>OS</span>
    </h1>
    <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:3,textTransform:'uppercase',color:'rgba(255,255,255,.75)',marginTop:4,textShadow:'0 1px 6px rgba(0,20,40,.6)'}}>o universo do seu conhecimento</div>
  </div>
}
