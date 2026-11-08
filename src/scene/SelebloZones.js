import * as THREE from 'three'
import { KNOWLEDGE_DISTRICTS } from '../knowledgeCategories.js'

// SELEBLO V4 - distritos interativos, sem editar arquivos do Obsidian.
// Cada estação possui duas categorias e uma identidade visual própria.
export const getFolderPosition = folder => {
  const found = KNOWLEDGE_DISTRICTS.find(district => district.categories.some(category => category.id === folder))
  return found ? { x: found.x, z: found.z } : null
}

function plaqueTexture(n, name, color) {
  const c = document.createElement('canvas'); c.width=512; c.height=160
  const x = c.getContext('2d')
  x.fillStyle='rgba(4,18,35,.95)'; x.strokeStyle=color; x.lineWidth=4
  x.shadowColor=color; x.shadowBlur=18
  x.beginPath(); x.roundRect(10,14,492,130,20); x.fill(); x.stroke()
  x.shadowBlur=0
  x.fillStyle=color; x.fillRect(35,43,6,73)
  x.font='bold 24px monospace'; x.textAlign='left'; x.fillText(String(n).padStart(2,'0'),60,68)
  x.fillStyle='#EDF9FF'; x.font='bold 32px sans-serif'; x.fillText(name,60,113,410)
  const texture=new THREE.CanvasTexture(c)
  texture.minFilter=THREE.LinearFilter;texture.colorSpace=THREE.SRGBColorSpace
  return texture
}

function districtTexture(label,color) {
  const c=document.createElement('canvas');c.width=512;c.height=70
  const x=c.getContext('2d')
  x.font='bold 23px monospace';x.textAlign='center'
  x.fillStyle=color;x.shadowColor=color;x.shadowBlur=10
  x.fillText(label,256,43)
  const t=new THREE.CanvasTexture(c)
  t.minFilter=THREE.LinearFilter;t.colorSpace=THREE.SRGBColorSpace
  return t
}

export function createKnowledgeZones({ office, camera, renderer, onSelect }) {
  const surface=renderer.domElement
  const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2()
  const clickable=[], disposables=[], floaters=[], pads=[]
  let start=null, hovered=null, selected=null
  let tick=0

  function track(mesh, { target=false, texture=null }={}) {
    office.add(mesh)
    disposables.push({mesh,texture})
    if(target) clickable.push(mesh)
    return mesh
  }

  KNOWLEDGE_DISTRICTS.forEach((group, i) => {
    const color=new THREE.Color(group.color)
    // Baixo contraste: o ambiente existente permanece legível.
    const under=track(new THREE.Mesh(
      new THREE.PlaneGeometry(3.5,2.65),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide})
    ))
    under.rotation.x=-Math.PI/2;under.position.set(group.x,.048,group.z+.1)
    const border=track(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.5,.025,2.65)),
      new THREE.LineBasicMaterial({color,transparent:true,opacity:.48})
    ))
    border.position.set(group.x,.066,group.z+.1)
    pads.push({ under, border, group })

    const districtT=districtTexture(group.title,group.color)
    const district=track(new THREE.Sprite(new THREE.SpriteMaterial({map:districtT,transparent:true,opacity:.88,depthTest:false})),{texture:districtT})
    district.scale.set(2.65,.39,1);district.position.set(group.x,3.28,group.z+.1)
    floaters.push({mesh:district,origin:3.28,offset:i*.7,isLabel:false})

    group.categories.forEach((category,j)=>{
      const tx=plaqueTexture(i*2+j+1,category.label,group.color)
      const mesh=track(new THREE.Mesh(
        new THREE.PlaneGeometry(1.83,.58),
        new THREE.MeshBasicMaterial({map:tx,transparent:true,opacity:.95,depthTest:false,depthWrite:false,side:THREE.DoubleSide})
      ),{target:true,texture:tx})
      mesh.position.set(group.x+(j? .94:-.94),2.62,group.z+.1)
      mesh.renderOrder=95
      mesh.userData.folder=category.id
      floaters.push({mesh,origin:2.62,offset:i*.6+j*.4,isLabel:true})
    })
  })

  function hit(event) {
    const box=surface.getBoundingClientRect()
    if(!box.width||!box.height)return null
    pointer.set(((event.clientX-box.left)/box.width)*2-1,-((event.clientY-box.top)/box.height)*2+1)
    raycaster.setFromCamera(pointer,camera)
    return raycaster.intersectObjects(clickable,false)[0]?.object||null
  }
  function down(e){if(e.button===0)start={x:e.clientX,y:e.clientY}}
  function up(e){
    if(!start||e.button!==0)return
    const moved=Math.hypot(e.clientX-start.x,e.clientY-start.y)
    start=null
    if(moved>7)return
    const target=hit(e)
    if(target?.userData.folder){selected=target.userData.folder;onSelect?.(selected)}
  }
  function move(e){hovered=hit(e);surface.style.cursor=hovered?'pointer':'grab'}
  function leave(){start=null;hovered=null;surface.style.cursor='grab'}
  surface.addEventListener('pointerdown',down)
  surface.addEventListener('pointerup',up)
  surface.addEventListener('pointermove',move)
  surface.addEventListener('pointerleave',leave)
  surface.style.cursor='grab'

  return {
    setActive(folder){selected=folder||null},
    update(){
      tick+=.016
      for (const {mesh,origin,offset,isLabel} of floaters){
        mesh.position.y=origin+Math.sin(tick*1.3+offset)*.035
        if(isLabel){
          mesh.quaternion.copy(camera.quaternion)
          const active=selected===mesh.userData.folder
          const over=hovered===mesh
          mesh.scale.setScalar(over?1.17:active?1.07:1)
          mesh.material.opacity=over||active?1:.92
        }
      }
      for(const {under,border,group} of pads){
        const active=group.categories.some(category=>category.id===selected)
        under.material.opacity=active ? 0.16 : 0.065+Math.sin(tick*1.5)*0.012
        border.material.opacity=active ? 0.95 : 0.42+Math.sin(tick*1.5)*0.09
      }
    },
    dispose(){
      surface.removeEventListener('pointerdown',down)
      surface.removeEventListener('pointerup',up)
      surface.removeEventListener('pointermove',move)
      surface.removeEventListener('pointerleave',leave)
      surface.style.cursor=''
      for(const {mesh,texture} of disposables){
        office.remove(mesh)
        mesh.geometry?.dispose?.()
        mesh.material?.dispose?.()
        texture?.dispose?.()
      }
    }
  }
}
