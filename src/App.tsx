import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Clock, 
  Camera, 
  AlertCircle,
  History,
  X,
  Check,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants ---
const FIXED_DEADLINE = new Date('2026-04-24T12:00:00+08:00').getTime();
const USER_DURATION = 48 * 60 * 60 * 1000; // 48 hours
const FEISHU_WEBHOOK_URL = ''; // 用户自行填写的Webhook地址

const STORAGE_KEYS = {
  FIRST_VISIT: 'onion_highlighter_first_visit',
  SUBMIT_COUNT: 'onion_highlighter_submit_count',
  SUBMIT_HISTORY: 'onion_highlighter_submit_history',
  USER_ID: 'onion_highlighter_user_id'
};

export default function App() {
  // --- State ---
  const [timeLeft, setTimeLeft] = useState<{ total: number; h: number; m: number; s: number } | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [deadlineStr, setDeadlineStr] = useState('');
  
  const [onionId, setOnionId] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  
  // Modals
  const [showHistory, setShowHistory] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // --- Logic: Countdown & Deadlines ---
  useEffect(() => {
    let firstVisit = localStorage.getItem(STORAGE_KEYS.FIRST_VISIT);
    if (!firstVisit) {
      firstVisit = Date.now().toString();
      localStorage.setItem(STORAGE_KEYS.FIRST_VISIT, firstVisit);
    }
    
    const timeA = parseInt(firstVisit) + USER_DURATION;
    const finalDeadline = Math.min(timeA, FIXED_DEADLINE);
    
    const deadlineDate = new Date(finalDeadline);
    setDeadlineStr(`${deadlineDate.getMonth() + 1}月${deadlineDate.getDate()}日 ${deadlineDate.getHours().toString().padStart(2, '0')}:${deadlineDate.getMinutes().toString().padStart(2, '0')}`);

    const timer = setInterval(() => {
      const now = Date.now();
      const distance = finalDeadline - now;
      
      if (distance <= 0) {
        clearInterval(timer);
        setIsExpired(true);
        setTimeLeft({ total: 0, h: 0, m: 0, s: 0 });
      } else {
        const h = Math.floor(distance / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft({ total: distance, h, m, s });
      }
    }, 1000);

    // Sync other user data
    setSubmitCount(parseInt(localStorage.getItem(STORAGE_KEYS.SUBMIT_COUNT) || '0'));
    setOnionId(localStorage.getItem(STORAGE_KEYS.USER_ID) || '');
    setHistory(JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMIT_HISTORY) || '[]'));

    return () => clearInterval(timer);
  }, []);

  // --- Form Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (images.length + files.length > 2) {
      alert('一次最多只能提交 2 张截图哦～想要更多请分次提交！');
      return;
    }

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onionId) return alert('请输入洋葱ID');
    if (images.length === 0) return alert('请上传分享截图');
    if (isExpired) return alert('活动已截止');

    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/submit-to-feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onionId,
          timestamp: new Date().toLocaleString(),
          images,
          count: images.length
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || '同步飞书失败');
      }
      
      const newCount = submitCount + 1;
      const newEntry = {
        id: Date.now(),
        time: new Date().toLocaleString(),
        imageCount: images.length,
        status: 'pending'
      };
      const newHistory = [newEntry, ...history];
      
      localStorage.setItem(STORAGE_KEYS.SUBMIT_COUNT, newCount.toString());
      localStorage.setItem(STORAGE_KEYS.SUBMIT_HISTORY, JSON.stringify(newHistory));
      localStorage.setItem(STORAGE_KEYS.USER_ID, onionId);
      
      setSubmitCount(newCount);
      setHistory(newHistory);
      setSubmitStatus('success');
      setShowSuccess(true);
      setImages([]);
    } catch (err) {
      console.error(err);
      alert('网络异常，提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-ink font-sans selection:bg-orange-100 pb-12 overflow-x-hidden">
      
      {/* 1. Hero Section */}
      <div className="relative overflow-hidden pb-8 pt-4">
        {/* Close Button - Repositioned to align with deadline */}
        <button 
          onClick={() => window.close()}
          className="absolute top-[88px] left-6 z-[150] p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/20 rounded-full text-white transition-all active:scale-95 group"
          title="关闭页面"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>
        <div className="px-5 flex items-center justify-center max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full"
          >
            <Clock className="w-4 h-4 text-accent animate-pulse" />
            <span className="text-white text-[10px] font-bold whitespace-nowrap flex items-center gap-1">
              {isExpired ? '活动已失效' : (
                <>
                  <span>专属福利掉落，抢位倒计时中！</span>
                  <span className="text-accent ml-1">
                    {timeLeft ? `${timeLeft.h.toString().padStart(2, '0')}:${timeLeft.m.toString().padStart(2, '0')}:${timeLeft.s.toString().padStart(2, '0')}` : '00:00:00'}
                  </span>
                </>
              )}
            </span>
          </motion.div>
        </div>

        <div className="mt-3 flex justify-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 rounded-xl text-white/90 text-[10px] font-black uppercase tracking-widest"
          >
            统一截榜时间：2026年4月24日 12:00
          </motion.div>
        </div>

        <div className="mt-6 px-6 text-center text-white">
          <motion.h1 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl md:text-5xl font-black italic tracking-tighter drop-shadow-[0_4px_0_#C64400]"
          >
            🌟 洋葱高光创作官 · 专属福利任务
          </motion.h1>
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-2 text-sm font-bold opacity-90"
          >
            燃爆社区，你的作品值得被全世界看见！
          </motion.div>

          <motion.button
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => setShowGuide(true)}
            className="mt-4 bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/30 px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 mx-auto transition-all active:scale-95"
          >
            ⚠️ <span className="underline underline-offset-2">注意事项</span>
          </motion.button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5">
        {!isExpired ? (
          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left Column: Rewards & Rules */}
            <div className="space-y-6">
              {/* 2. Rewards Section */}
              <section className="brutal-card">
                <div className="flex items-center gap-2 mb-6">
                  <Trophy className="w-6 h-6 text-primary" />
                  <h2 className="text-xl font-black text-primary uppercase">阶梯奖励 · 先到先得</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <RewardCard 
                    rank="🎁"
                    title="独家实物奖励"
                    limit="100% 包邮必得"
                    desc="活动期内累积达成 10 次有效分享，100% 包邮必得洋葱定制中性笔一支！"
                    color="bg-red-50 border-red-200"
                  />
                  <RewardCard 
                    rank="🥇"
                    title="学习类内容置顶福利"
                    limit="全网限量 9 席（各学段 3 席）！"
                    desc="满 3 次有效分享即可触发。按达标时间先后，解锁专属【全站置顶 24 小时】黄金档期！"
                    color="bg-bg-light border-primary"
                  />
                  <RewardCard 
                    rank="👑"
                    title="非学习类内容圈主福利"
                    limit="限量 8 席！"
                    desc="满 3 次有效分享即可锁定。按达标时间先后，解锁【最高流量时段-周五至周末】的【高光圈主】轮值权！"
                    color="bg-purple-50 border-purple-200"
                  />
                </div>
              </section>

              {/* 3. Rules Instruction Section */}
              <section className="brutal-card">
                <h3 className="text-lg font-black text-primary flex items-center gap-2 mb-4 uppercase">
                  <Smartphone className="w-5 h-5" /> 有效分享“避坑必看”
                </h3>
                <ul className="space-y-4">
                  <RuleItem icon="📱" text={<span><b>必须是全屏原图！</b> 截图要把手机顶部的【电量和时间】都截进去哦，千万别裁剪、打马赛克或 P 图，不然葱葱看不清就不算啦～</span>} />
                  <RuleItem icon="👀" text={<span><b>要真实发出去哦！</b> 分享的内容绝对不能“仅自己可见”或者秒删。建议让帖子飞一会儿（比如保留两小时）或者攒够 3 个赞再截图，稳稳的！</span>} />
                  <RuleItem icon="🚫" text={<span><b>不要拿同一张图糊弄！</b> 每次截图分享的好友/群聊/平台必须不同，禁止同一张截图反复上传。</span>} />
                </ul>
                <div className="mt-4 p-3 bg-accent/20 rounded-xl text-[10px] text-ink/80 leading-relaxed font-bold border-l-4 border-accent">
                  💡 1 张不重复的有效截图 = 1 次有效分享，一次性可提交2张截图。想冲刺 10 次拿大奖？请分多次提交表单哦！
                </div>
              </section>
            </div>

            {/* Right Column: Form & Progress */}
            <div className="space-y-6">
              <section className="brutal-card">
                <div className="flex items-center gap-2 mb-6">
                  <Loader2 className="w-6 h-6 text-primary" />
                  <h2 className="text-xl font-black text-primary uppercase">立即提交核验</h2>
                </div>

                <div className="mb-6 flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-ink">当前提交进度：<b className="text-lg">{submitCount}</b>/10</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden border-2 border-ink shadow-inner">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((submitCount / 10) * 100, 100)}%` }}
                      className="h-full bg-gradient-to-r from-accent to-primary"
                    />
                  </div>
                  <p className="text-[10px] text-red-600 font-bold mt-1">⚠️ 提示：此处仅记录表单提交次数，不代表最终有效分享次数。最终有效战绩以截榜后人工核验为准。</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-ink flex items-center gap-1">
                      洋葱 ID
                    </label>
                    <input 
                      type="text" 
                      value={onionId}
                      onChange={(e) => setOnionId(e.target.value)}
                      placeholder="请输入您的洋葱ID"
                      className="input-brutal"
                    />
                    <p className="text-[10px] text-gray-400 font-normal">不知道 ID？请前往 App - 我的 - 点击头像查看哦</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-ink">上传分享截图 <span className="font-normal text-gray-400">(单次限2张)</span></label>
                    <div className="grid grid-cols-2 gap-4">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-ink shadow-md">
                          <img src={img} className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-2 right-2 bg-black/70 p-1.5 rounded-full text-white shadow-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      
                      {images.length < 2 && (
                        <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:bg-orange-50 hover:border-primary active:scale-95 transition-all group">
                          <Camera className="w-8 h-8 text-gray-300 group-hover:text-primary mb-1 transition-colors" />
                          <span className="text-[10px] font-black text-gray-400 group-hover:text-primary">添加截图</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            onChange={handleImageUpload} 
                            className="hidden" 
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="brutal-btn w-full py-4 text-xl"
                  >
                    {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : '提交核验，冲刺大奖！'}
                  </button>
                </form>

                <button 
                  onClick={() => setShowHistory(true)}
                  className="mt-6 w-full text-primary hover:underline transition-all text-sm font-black italic flex items-center justify-center gap-2"
                >
                  👀 查看我的提交记录
                </button>
              </section>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-10 bg-white border-4 border-ink rounded-[40px] flex flex-col items-center text-center shadow-[0_12px_0_rgba(0,0,0,0.1)]"
            >
              <div className="text-7xl mb-6">⏰</div>
              <h1 className="text-3xl font-black mb-4">哎呀，你错过了本次限时活动！</h1>
              <p className="text-gray-500 text-base leading-relaxed">
                本次分享任务通道已正式关闭。请继续生产优质作品，等待下次被选中的高光机会哦~
              </p>
              <button 
                onClick={() => window.close()}
                className="brutal-btn mt-10 px-10 py-4 w-auto text-xl"
              >关闭页面</button>
            </motion.div>
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      
      <AnimatePresence>
        {showSuccess && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSuccess(false)} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-[340px] bg-white border-4 border-ink rounded-[40px] p-8 text-center shadow-2xl">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-green-200">
                <Check className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-black text-ink mb-4 leading-tight">
                🎊提交成功！
              </h3>
              <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed">
                继续去其他阵地进行分享，冲刺大奖吧！
              </p>
              <button 
                onClick={() => setShowSuccess(false)}
                className="brutal-btn w-full py-4 text-lg bg-primary text-white"
              >
                我知道了
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="relative w-full max-w-md bg-white border-4 border-ink rounded-[32px] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
              <div className="p-6 flex justify-between items-center bg-white border-b-2 border-ink">
                <h3 className="text-xl font-black text-ink uppercase">我的提交记录</h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-all"><X className="w-6 h-6" /></button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="bg-bg-light p-4 rounded-xl border-2 border-primary/20 text-[10px] text-primary font-black mb-6">
                  💡 进度已安全保存在本地！为保证公平，所有截图将在 4 月 24 日截榜后统一人工核验，最终排期与大奖请留意4月24日周五下午18点的站内信发榜通知哦！
                </div>
                <div className="space-y-4">
                  {history.length === 0 ? <p className="text-center text-gray-300 py-10 font-bold">还没有提交记录，快去分享吧~</p> : history.map(item => (
                    <div key={item.id} className="p-4 border-2 border-gray-100 rounded-2xl flex justify-between items-center bg-gray-50 hover:border-primary/30 transition-all">
                      <div>
                        <div className="text-xs font-black text-ink">提交记录 ({item.imageCount}张截图)</div>
                        <div className="text-[10px] text-gray-400 mt-1">{item.time}</div>
                      </div>
                      <div className="text-[10px] font-black text-primary uppercase">⏳ 待4月24日统一核算</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGuide(false)} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full max-w-[360px] bg-white border-[3px] border-ink rounded-[32px] p-6 max-h-[80vh] flex flex-col shadow-2xl">
              <h2 className="text-xl font-black text-primary mb-4 flex items-center gap-2">⚠️ 任务注意事项</h2>
              <div className="overflow-y-auto flex-1 space-y-6 pr-1 custom-scrollbar">
                
                {/* Section 1 */}
                <div>
                  <h3 className="text-lg font-black text-ink mb-3 border-l-4 border-primary pl-3">关于 48 小时限时任务</h3>
                  <div className="space-y-3 text-sm text-gray-600 font-bold leading-relaxed">
                    <div className="flex gap-2">
                      <span className="text-primary">1.</span>
                      <p>你的专属 <code className="bg-orange-50 px-1 rounded text-primary">48</code> 小时倒计时从首次打开任务页时开始计算；中途退出、刷新页面或关闭设备，倒计时均不会暂停。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">2.</span>
                      <p>本活动同时受“个人 <code className="bg-orange-50 px-1 rounded text-primary">48</code> 小时任务时限”与“活动统一截榜时间”约束，以较早到达的时间为最终截止时间。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">3.</span>
                      <p>若在倒计时结束前未完成提交，或活动统一截榜时间已到，则未提交内容不再计入本期结果。</p>
                    </div>
                  </div>
                </div>

                {/* Section 2 */}
                <div>
                  <h3 className="text-lg font-black text-ink mb-3 border-l-4 border-primary pl-3">关于有效分享与防作弊规则</h3>
                  <div className="space-y-3 text-sm text-gray-600 font-bold leading-relaxed">
                    <div className="flex gap-2">
                      <span className="text-primary">1.</span>
                      <p><code className="bg-gray-100 px-1 rounded text-ink">1 张不重复截图 = 1 次有效分享</code>。同一截图重复上传、同一分享记录重复提交，仅按 <code className="bg-gray-100 px-1 rounded text-ink">1</code> 次计算。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">2.</span>
                      <p>分享内容需为用户本人对指定帖子进行的真实端外分享，且分享对象需为真实可见场景，不支持“仅自己可见”。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">3.</span>
                      <p>同一分享场景下的连续重复动作不重复计数，包括但不限于同一群聊内重复发送、同一动态反复截图上传等。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">4.</span>
                      <p>截图需具备基本真实性与可识别性。若存在重复、拼接、关键字段缺失、明显遮挡、无法判断分享对象或分享时间线等情况，运营有权判定为无效记录。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">5.</span>
                      <p>如发现伪造、篡改、搬运他人截图或批量刷量等作弊行为，平台有权取消该用户本期活动资格及奖励进度。</p>
                    </div>
                  </div>
                </div>

                {/* Section 3 */}
                <div>
                  <h3 className="text-lg font-black text-ink mb-3 border-l-4 border-primary pl-3">关于如何交满 10 次截图</h3>
                  <div className="space-y-3 text-sm text-gray-600 font-bold leading-relaxed">
                    <div className="flex gap-2">
                      <span className="text-primary">1.</span>
                      <p>为保证上传稳定性，每次表单最多支持选择 <code className="bg-orange-50 px-1 rounded text-primary">2</code> 张图片。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">2.</span>
                      <p>用户可多次重复提交表单；若需冲刺 <code className="bg-orange-50 px-1 rounded text-primary">10</code> 次分享，可分批提交（例如提交 <code className="bg-orange-50 px-1 rounded text-primary">5</code> 次，每次 <code className="bg-orange-50 px-1 rounded text-primary">2</code> 张）。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">3.</span>
                      <p>系统以用户填写的【洋葱 ID】作为战绩合并主键进行统计，请务必准确填写。</p>
                    </div>
                  </div>
                </div>

                {/* Section 4 */}
                <div>
                  <h3 className="text-lg font-black text-ink mb-3 border-l-4 border-primary pl-3">关于抢排期与实物发奖</h3>
                  <div className="space-y-3 text-sm text-gray-600 font-bold leading-relaxed">
                    <div className="flex gap-2">
                      <span className="text-primary">1.</span>
                      <p>置顶与圈主名额按用户“第 <code className="bg-orange-50 px-1 rounded text-primary">3</code> 次成功提交有效截图”的时间进行排序，越早达标，越有机会抢到前排资源。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">2.</span>
                      <p>学习类奖励按内容所属学段独立排名，不可跨学段占用名额。</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">3.</span>
                      <p>活动结束后，若用户达成中性笔奖励，将通过站内消息下发地址收集通知；用户需在截止时间内填写收货信息，逾期视为放弃。</p>
                    </div>
                  </div>
                </div>

                {/* Section 5 */}
                <div>
                  <h3 className="text-lg font-black text-ink mb-3 border-l-4 border-primary pl-3 text-sm">合规与数据处理说明</h3>
                  <div className="space-y-2 text-[11px] text-gray-400 font-medium leading-relaxed">
                    <p>1. 本活动提交阶段仅收集活动核验所需的最小必要信息，默认使用【洋葱 ID + 截图记录】进行资格核验与战绩合并。</p>
                    <p>2. 手机号、收货地址等敏感信息仅在用户确认获得实物奖励后，通过单独的地址收集表单补充获取，用于奖励发放及异常争议复核，不做公开展示，不挪作其他用途。</p>
                    <p>3. 用户提交的截图仅用于判断是否完成有效分享，不作为对外传播素材使用；如需作为案例展示，须再次脱敏处理。</p>
                    <p>4. 涉及手机号、地址等敏感信息时，仅限活动负责人与必要的发奖协作人员可访问。</p>
                    <p>5. 活动结束后，相关敏感信息按最小必要原则保留，并在发奖完成及客诉处理结束后及时清理。</p>
                    <p>6. 活动执行过程中，不主动引导用户公开披露真实姓名、学校、家庭住址等额外敏感个人信息。</p>
                  </div>
                </div>

                <div className="h-4" />
              </div>
              <button 
                onClick={() => setShowGuide(false)} 
                className="brutal-btn mt-6 py-4 text-lg"
              >
                我知道了，火速开冲
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-white text-ink text-3xl font-black p-2 rounded-xl border-2 border-ink min-w-16 flex items-center justify-center shadow-[0_4px_0_rgba(0,0,0,0.1)]">
        {value.toString().padStart(2, '0')}
      </div>
      <div className="text-[9px] text-white font-black mt-1 uppercase tracking-tighter">{label}</div>
    </div>
  );
}

function RewardCard({ rank, title, limit, desc, color }: any) {
  return (
    <div className={`p-4 rounded-xl border-2 border-ink ${color} flex gap-4 items-start transition-all hover:scale-[1.02] shadow-[4px_4px_0_var(--color-ink)]`}>
      <span className="text-3xl mt-1">{rank}</span>
      <div className="text-left">
        <div className="flex flex-wrap items-center gap-1 mb-1">
          <span className="font-black text-ink text-sm">{title}</span>
          <span className="text-[8px] font-black px-1.5 py-0.5 bg-white border border-ink/10 rounded">{limit}</span>
        </div>
        <p className="text-[10px] text-gray-500 font-bold leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function RuleItem({ icon, text }: { icon: string; text: any }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="text-xl shrink-0">{icon}</span>
      <span className="text-xs font-bold text-gray-600 leading-normal">{text}</span>
    </li>
  );
}
