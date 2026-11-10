'use strict';
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');

types.setTypeParser(1700, Number);
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1082, (value) => value);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'desenvolvimento-chave-estoque';
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function auth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ mensagem: 'Não autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ mensagem: 'Sessão inválida ou expirada' });
  }
}
function admin(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ mensagem: 'Acesso restrito ao administrador' });
  next();
}

app.post('/api/login', asyncRoute(async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ mensagem: 'Informe e-mail e senha' });
  const result = await pool.query('SELECT * FROM usuarios WHERE lower(email)=lower($1) AND ativo=TRUE', [email.trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
    return res.status(401).json({ mensagem: 'E-mail ou senha inválidos' });
  }
  const token = jwt.sign({ id: user.id, nome: user.nome, perfil: user.perfil }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, nome: user.nome, perfil: user.perfil });
}));

app.use('/api', auth);

function crud(table, fields, options = {}) {
  app.get(`/api/${table}`, asyncRoute(async (req, res) => {
    const result = await pool.query(options.listQuery || `SELECT * FROM ${table} ORDER BY id`);
    res.json(result.rows);
  }));
  app.post(`/api/${table}`, asyncRoute(async (req, res) => {
    const columns = fields.filter(f => req.body[f] !== undefined);
    if (!columns.length) return res.status(400).json({ mensagem: 'Nenhum dado informado' });
    if (table === 'usuarios') {
      if (!req.body.senha || req.body.senha.length < 6) return res.status(400).json({ mensagem: 'A senha deve ter no mínimo 6 caracteres' });
      columns.push('senha_hash');
      req.body.senha_hash = await bcrypt.hash(req.body.senha, 10);
    }
    const values = columns.map(c => req.body[c]);
    const names = columns.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${names}) RETURNING *`, values);
    const row = result.rows[0];
    delete row.senha_hash;
    res.status(201).json(row);
  }));
  app.put(`/api/${table}/:id`, asyncRoute(async (req, res) => {
    const columns = fields.filter(f => req.body[f] !== undefined);
    let password;
    if (table === 'usuarios') {
      if (req.body.senha) {
        if (req.body.senha.length < 6) return res.status(400).json({ mensagem: 'A senha deve ter no mínimo 6 caracteres' });
        password = await bcrypt.hash(req.body.senha, 10);
      }
    }
    if (!columns.length && !password) return res.status(400).json({ mensagem: 'Nenhum dado informado' });
    const assignments = columns.map((c, i) => `${c}=$${i + 1}`);
    const values = columns.map(c => req.body[c]);
    if (password) { assignments.push(`senha_hash=$${values.length + 1}`); values.push(password); }
    const result = await pool.query(`UPDATE ${table} SET ${assignments.join(',')} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ mensagem: 'Registro não encontrado' });
    const row = result.rows[0]; delete row.senha_hash; res.json(row);
  }));
}

app.get('/api/categorias', auth, asyncRoute(async (req,res) => { const r=await pool.query('SELECT * FROM categorias ORDER BY nome'); res.json(r.rows); }));
app.post('/api/categorias', auth, asyncRoute(async (req,res) => { const r=await pool.query('INSERT INTO categorias(nome) VALUES($1) RETURNING *',[req.body.nome]); res.status(201).json(r.rows[0]); }));
app.put('/api/categorias/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query('UPDATE categorias SET nome=$1 WHERE id=$2 RETURNING *',[req.body.nome,req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.json(r.rows[0]); }));
app.delete('/api/categorias/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query('DELETE FROM categorias WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.status(204).send(); }));

app.get('/api/fornecedores', auth, asyncRoute(async (req,res) => { const r=await pool.query('SELECT * FROM fornecedores ORDER BY nome'); res.json(r.rows); }));
app.post('/api/fornecedores', auth, asyncRoute(async (req,res) => { const r=await pool.query('INSERT INTO fornecedores(nome,descricao,telefone,ativo) VALUES($1,$2,$3,COALESCE($4,TRUE)) RETURNING *',[req.body.nome,req.body.descricao,req.body.telefone,req.body.ativo]); res.status(201).json(r.rows[0]); }));
app.put('/api/fornecedores/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query('UPDATE fornecedores SET nome=$1,descricao=$2,telefone=$3,ativo=$4 WHERE id=$5 RETURNING *',[req.body.nome,req.body.descricao,req.body.telefone,req.body.ativo,req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.json(r.rows[0]); }));
app.delete('/api/fornecedores/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query('DELETE FROM fornecedores WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.status(204).send(); }));

app.get('/api/produtos', auth, asyncRoute(async (req,res) => {
  const r=await pool.query(`SELECT p.*, c.nome AS categoria, COALESCE(SUM(l.quantidade),0) AS estoque_atual FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id LEFT JOIN lotes_estoque l ON l.produto_id=p.id GROUP BY p.id,c.nome ORDER BY p.nome`);
  res.json(r.rows);
}));
app.post('/api/produtos', auth, asyncRoute(async (req,res) => { const r=await pool.query(`INSERT INTO produtos(nome,categoria_id,unidade,estoque_minimo,dias_alerta_validade,preco_custo,ativo) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,TRUE)) RETURNING *`,[req.body.nome,req.body.categoria_id||null,req.body.unidade||'UN',req.body.estoque_minimo||0,req.body.dias_alerta_validade,req.body.preco_custo||0,req.body.ativo]); res.status(201).json(r.rows[0]); }));
app.put('/api/produtos/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query(`UPDATE produtos SET nome=$1,categoria_id=$2,unidade=$3,estoque_minimo=$4,dias_alerta_validade=$5,preco_custo=$6,ativo=$7 WHERE id=$8 RETURNING *`,[req.body.nome,req.body.categoria_id||null,req.body.unidade,req.body.estoque_minimo,req.body.dias_alerta_validade,req.body.preco_custo,req.body.ativo,req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.json(r.rows[0]); }));
app.delete('/api/produtos/:id', auth, asyncRoute(async (req,res) => { const r=await pool.query('DELETE FROM produtos WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.status(204).send(); }));

app.get('/api/usuarios', auth, admin, asyncRoute(async (req,res) => { const r=await pool.query('SELECT id,nome,email,perfil,ativo,criado_em FROM usuarios ORDER BY nome'); res.json(r.rows); }));
app.post('/api/usuarios', auth, admin, asyncRoute(async (req,res) => { if(!req.body.senha || req.body.senha.length<6)return res.status(400).json({mensagem:'A senha deve ter no mínimo 6 caracteres'}); const hash=await bcrypt.hash(req.body.senha,10); const r=await pool.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,ativo) VALUES($1,$2,$3,$4,COALESCE($5,TRUE)) RETURNING id,nome,email,perfil,ativo,criado_em`,[req.body.nome,req.body.email,hash,req.body.perfil||'operador',req.body.ativo]); res.status(201).json(r.rows[0]); }));
app.put('/api/usuarios/:id', auth, admin, asyncRoute(async (req,res) => { let hash; if(req.body.senha){if(req.body.senha.length<6)return res.status(400).json({mensagem:'A senha deve ter no mínimo 6 caracteres'});hash=await bcrypt.hash(req.body.senha,10);} const set=['nome=$1','email=$2','perfil=$3','ativo=$4']; const vals=[req.body.nome,req.body.email,req.body.perfil,req.body.ativo]; if(hash){set.push(`senha_hash=$${vals.length+1}`);vals.push(hash);} vals.push(req.params.id); const r=await pool.query(`UPDATE usuarios SET ${set.join(',')} WHERE id=$${vals.length} RETURNING id,nome,email,perfil,ativo,criado_em`,vals); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'});res.json(r.rows[0]); }));
app.delete('/api/usuarios/:id', auth, admin, asyncRoute(async (req,res) => { if(String(req.params.id)===String(req.user.id)) return res.status(400).json({mensagem:'Você não pode excluir o próprio usuário'}); const r=await pool.query('DELETE FROM usuarios WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount)return res.status(404).json({mensagem:'Registro não encontrado'}); res.status(204).send(); }));

app.get('/api/lotes', auth, asyncRoute(async (req,res) => { const r=await pool.query(`SELECT l.*,p.nome AS produto,p.unidade,p.dias_alerta_validade, CASE WHEN l.data_validade IS NULL THEN 'sem validade' WHEN l.data_validade < CURRENT_DATE THEN 'vencido' WHEN l.data_validade <= CURRENT_DATE + COALESCE(p.dias_alerta_validade,0) THEN 'a vencer' ELSE 'ok' END AS situacao FROM lotes_estoque l JOIN produtos p ON p.id=l.produto_id WHERE l.quantidade>0 AND p.ativo=TRUE ORDER BY CASE WHEN l.data_validade IS NULL THEN 1 ELSE 0 END,l.data_validade`); res.json(r.rows); }));

app.get('/api/movimentacoes', auth, asyncRoute(async (req,res) => { const r=await pool.query(`SELECT m.*,p.nome AS produto,p.unidade,l.codigo_lote,u.nome AS usuario,f.nome AS fornecedor FROM movimentacoes_estoque m JOIN produtos p ON p.id=m.produto_id JOIN lotes_estoque l ON l.id=m.lote_id LEFT JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN fornecedores f ON f.id=m.fornecedor_id ORDER BY m.criado_em DESC,m.id DESC LIMIT 200`); res.json(r.rows); }));

app.post('/api/movimentacoes', auth, asyncRoute(async (req,res) => {
  const { produto_id, tipo, quantidade, codigo_lote='SEM-LOTE', data_validade=null, custo_unitario, fornecedor_id=null, referencia=null } = req.body;
  const qtd=Number(quantidade);
  if (!['entrada','saida','perda'].includes(tipo)) return res.status(400).json({mensagem:'Tipo de movimentação inválido'});
  if (!Number.isFinite(qtd)||qtd<=0) return res.status(400).json({mensagem:'Quantidade deve ser maior que zero'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const produto=await client.query('SELECT * FROM produtos WHERE id=$1 AND ativo=TRUE',[produto_id]);
    if(!produto.rowCount){await client.query('ROLLBACK');return res.status(400).json({mensagem:'Produto inválido'});}
    if(tipo==='entrada'){
      const lote=await client.query(`INSERT INTO lotes_estoque(produto_id,codigo_lote,data_validade,quantidade) VALUES($1,$2,$3,$4) ON CONFLICT (produto_id,codigo_lote,(COALESCE(data_validade,'9999-12-31'::date))) DO UPDATE SET quantidade=lotes_estoque.quantidade+EXCLUDED.quantidade, atualizado_em=CURRENT_TIMESTAMP RETURNING *`,[produto_id,codigo_lote,data_validade||null,qtd]);
      if(custo_unitario!==undefined&&custo_unitario!==null&&custo_unitario!=='') await client.query('UPDATE produtos SET preco_custo=$1 WHERE id=$2',[custo_unitario,produto_id]);
      await client.query(`INSERT INTO movimentacoes_estoque(lote_id,produto_id,usuario_id,fornecedor_id,tipo,quantidade,custo_unitario,referencia) VALUES($1,$2,$3,$4,'entrada',$5,$6,$7)`,[lote.rows[0].id,produto_id,req.user.id,fornecedor_id||null,qtd,custo_unitario||null,referencia]);
    } else {
      const lotes=await client.query(`SELECT * FROM lotes_estoque WHERE produto_id=$1 AND quantidade>0 ORDER BY CASE WHEN data_validade IS NULL THEN 1 ELSE 0 END,data_validade,id FOR UPDATE`,[produto_id]);
      const disponivel=lotes.rows.reduce((s,l)=>s+Number(l.quantidade),0);
      if(disponivel<qtd){await client.query('ROLLBACK');return res.status(400).json({mensagem:'Estoque insuficiente'});}
      let restante=qtd;
      for(const lote of lotes.rows){
        if(restante<=0)break;
        const consumir=Math.min(restante,Number(lote.quantidade));
        await client.query('UPDATE lotes_estoque SET quantidade=quantidade-$1, atualizado_em=CURRENT_TIMESTAMP WHERE id=$2',[consumir,lote.id]);
        await client.query(`INSERT INTO movimentacoes_estoque(lote_id,produto_id,usuario_id,fornecedor_id,tipo,quantidade,custo_unitario,referencia) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[lote.id,produto_id,req.user.id,fornecedor_id||null,tipo,consumir,null,referencia]);
        restante-=consumir;
      }
    }
    await client.query('COMMIT'); res.status(201).json({mensagem:'Movimentação registrada'});
  } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));

app.get('/api/dashboard', auth, asyncRoute(async (req,res) => {
  const [totais,baixo,vencidosA, vencendo,categorias,movs]=await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*) FROM produtos WHERE ativo) produtos, COALESCE(SUM(l.quantidade*p.preco_custo),0) valor_estoque, COALESCE((SELECT COUNT(*) FROM (SELECT p.id FROM produtos p LEFT JOIN lotes_estoque l ON l.produto_id=p.id WHERE p.ativo GROUP BY p.id HAVING COALESCE(SUM(l.quantidade),0)<=p.estoque_minimo) x),0) abaixo_minimo FROM produtos p LEFT JOIN lotes_estoque l ON l.produto_id=p.id WHERE p.ativo`),
    pool.query(`SELECT p.id,p.nome,p.unidade,p.estoque_minimo,COALESCE(SUM(l.quantidade),0) estoque_atual,(COALESCE(SUM(l.quantidade),0)-p.estoque_minimo) diferenca FROM produtos p LEFT JOIN lotes_estoque l ON l.produto_id=p.id WHERE p.ativo GROUP BY p.id HAVING COALESCE(SUM(l.quantidade),0)<=p.estoque_minimo ORDER BY COALESCE(SUM(l.quantidade),0)-p.estoque_minimo ASC LIMIT 8`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE CASE WHEN l.data_validade IS NULL THEN false WHEN l.data_validade<CURRENT_DATE THEN true ELSE false END) vencidos, COUNT(*) FILTER (WHERE l.data_validade>=CURRENT_DATE AND l.data_validade<=CURRENT_DATE+COALESCE(p.dias_alerta_validade,0)) a_vencer FROM lotes_estoque l JOIN produtos p ON p.id=l.produto_id WHERE l.quantidade>0 AND p.ativo`),
    pool.query(`SELECT l.*,p.nome AS produto,p.unidade, CASE WHEN l.data_validade<CURRENT_DATE THEN 'vencido' ELSE 'a vencer' END situacao FROM lotes_estoque l JOIN produtos p ON p.id=l.produto_id WHERE l.quantidade>0 AND p.ativo AND l.data_validade IS NOT NULL AND l.data_validade<=CURRENT_DATE+COALESCE(p.dias_alerta_validade,0) ORDER BY l.data_validade ASC LIMIT 8`),
    pool.query(`SELECT COALESCE(c.nome,'Sem categoria') categoria,COALESCE(SUM(l.quantidade*p.preco_custo),0) valor FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id JOIN lotes_estoque l ON l.produto_id=p.id WHERE p.ativo AND l.quantidade>0 GROUP BY c.nome ORDER BY valor DESC`),
    pool.query(`SELECT d::date dia,m.tipo,COALESCE(SUM(mv.quantidade),0) total FROM generate_series(CURRENT_DATE-13::date,CURRENT_DATE,INTERVAL '1 day') d CROSS JOIN (VALUES ('entrada'),('saida'),('perda')) m(tipo) LEFT JOIN movimentacoes_estoque mv ON mv.criado_em::date=d::date AND mv.tipo=m.tipo GROUP BY d,m.tipo ORDER BY d,m.tipo`)
  ]);
  res.json({produtos:totais.rows[0].produtos||0,valor_estoque:Number(totais.rows[0].valor_estoque)||0,abaixo_minimo:Number(totais.rows[0].abaixo_minimo)||0,vencidos:Number(vencidosA.rows[0].vencidos)||0,a_vencer:Number(vencidosA.rows[0].a_vencer)||0,baixo:baixo.rows,vencendo:vencendo.rows,categorias:categorias.rows,movs:movs.rows});
}));

app.use((err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({mensagem:'Registro duplicado'});
  if (err.code === '23503') return res.status(409).json({mensagem:'Este cadastro não pode ser excluído porque está sendo utilizado'});
  console.error(err);
  res.status(err.status || 500).json({mensagem:err.statusMessage || err.message || 'Erro interno do servidor'});
});

async function start() {
  try {
    await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
    const users=await pool.query('SELECT 1 FROM usuarios LIMIT 1');
    if(!users.rowCount){
      const hash=await bcrypt.hash('admin123',10);
      await pool.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('Administrador','admin@estoque.com',$1,'admin')",[hash]);
      console.log('Admin criado: admin@estoque.com / admin123 - Troque esta senha após o primeiro acesso.');
    }
    const port=Number(process.env.PORT)||3000;
    app.listen(port,()=>console.log(`Estoque rodando em http://localhost:${port}`));
  } catch(err){ console.error('Falha ao iniciar:',err.message); process.exit(1); }
}
start();
