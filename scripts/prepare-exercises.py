"""Build the project's original bilingual practice bank; no network required."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# level | topic | English | reference Chinese | semantic keyword groups
# Each row is authored as a complete bilingual exercise, not dictionary output.
ROWS = r"""
beginner|日常生活|I usually get up at seven.|我通常七点起床。|usually=通常/一般;get up=起床;seven=七点/7点
beginner|日常生活|Please put the milk in the fridge.|请把牛奶放进冰箱。|put=放;milk=牛奶;fridge=冰箱
beginner|日常生活|My sister walks to school every day.|我妹妹每天步行上学。|My sister=我妹妹/我姐姐;walks=步行/走路;every day=每天
beginner|日常生活|The soup is too hot to drink.|汤太烫了，不能喝。|soup=汤;too hot=太烫/太热;to drink=喝
beginner|日常生活|We need some bread for breakfast.|我们早餐需要一些面包。|need=需要;bread=面包;breakfast=早餐/早饭
beginner|日常生活|Could you open the window, please?|请你打开窗户好吗？|Could you=请你/能不能/可以;open=打开;window=窗户/窗
beginner|日常生活|There are two cats under the table.|桌子下面有两只猫。|two cats=两只猫/两只小猫;under=下面/底下;table=桌子/桌
beginner|日常生活|I left my keys on the sofa.|我把钥匙落在沙发上了。|left=落在/忘在/留在;keys=钥匙;sofa=沙发
beginner|日常生活|Let us cook dinner together tonight.|今晚我们一起做晚饭吧。|tonight=今晚/今天晚上;cook dinner=做晚饭/做饭;together=一起
beginner|日常生活|The shop is closed on Sundays.|这家商店星期天不营业。|shop=商店/店;closed=不营业/关门;Sundays=星期天/周日/星期日
beginner|出行旅行|The next train leaves at nine.|下一班火车九点出发。|next train=下一班火车;leaves=出发/开车;nine=九点/9点
beginner|出行旅行|I would like a window seat.|我想要一个靠窗的座位。|would like=想要/想坐;window=靠窗/窗边;seat=座位
beginner|出行旅行|Please show me your ticket.|请给我看一下你的票。|show me=给我看/让我看;your=你的;ticket=票
beginner|出行旅行|Turn left at the traffic lights.|在红绿灯处左转。|Turn left=左转/向左转;at=在;traffic lights=红绿灯/交通信号灯
beginner|出行旅行|Our hotel is near the beach.|我们的酒店在海滩附近。|Our hotel=我们的酒店/我们的旅馆;near=附近/靠近;beach=海滩/沙滩
beginner|出行旅行|How long does the bus ride take?|坐公交车要多长时间？|How long=多长时间/多久;bus=公交车/公共汽车;ride=坐/乘
beginner|出行旅行|Do not leave your bag here.|不要把你的包留在这里。|Do not=不要/别;bag=包;here=这里/这儿
beginner|出行旅行|The museum opens at ten in the morning.|博物馆上午十点开门。|museum=博物馆;opens=开门/开放;ten in the morning=上午十点/早上十点
beginner|出行旅行|We can buy water at the station.|我们可以在车站买水。|buy=买;water=水;station=车站
beginner|出行旅行|Please keep your passport in a safe place.|请把你的护照放在安全的地方。|passport=护照;keep=放/保管;safe place=安全的地方/安全处
beginner|学习成长|I write new words in this notebook.|我把生词写在这个笔记本里。|new words=生词/新单词;write=写;notebook=笔记本
beginner|学习成长|Can you explain this question again?|你能再解释一下这道题吗？|explain=解释;question=题/问题;again=再/再次
beginner|学习成长|Our English class starts after lunch.|我们的英语课在午饭后开始。|English class=英语课;starts=开始;after lunch=午饭后/午餐后
beginner|学习成长|She reads a short story every night.|她每天晚上读一个短篇故事。|reads=读;short story=短篇故事/小故事;every night=每天晚上/每晚
beginner|学习成长|Please speak a little more slowly.|请说得再慢一点。|Please=请;speak=说;more slowly=再慢/慢一点
beginner|学习成长|I do my homework before dinner.|我在晚饭前做作业。|homework=作业;before=前;dinner=晚饭/晚餐
beginner|学习成长|This dictionary has clear examples.|这本词典有清楚的例句。|dictionary=词典/字典;clear=清楚/清晰;examples=例句/例子
beginner|学习成长|We study history on Friday afternoons.|我们星期五下午学历史。|study=学;history=历史;Friday afternoons=星期五下午/周五下午
beginner|学习成长|You can ask the teacher for help.|你可以向老师求助。|can=可以;teacher=老师;ask=求助/寻求帮助/请
beginner|学习成长|I made three mistakes in the exercise.|我在这道练习中犯了三个错误。|three=三个/三处;mistakes=错误;exercise=练习
beginner|职场沟通|The meeting starts in five minutes.|会议五分钟后开始。|meeting=会议;starts=开始;in five minutes=五分钟后/5分钟后
beginner|职场沟通|Please send the file by email.|请通过电子邮件发送这个文件。|send=发送/发;file=文件;email=电子邮件/邮件
beginner|职场沟通|I work from home on Mondays.|我星期一在家办公。|work=办公/工作;from home=在家;Mondays=星期一/周一
beginner|职场沟通|Could you print two copies for me?|你能帮我打印两份吗？|print=打印;two copies=两份;for me=帮我/给我
beginner|职场沟通|Our office is on the third floor.|我们的办公室在三楼。|Our office=我们的办公室;third=三;floor=楼/层
beginner|职场沟通|I will call you after the meeting.|会议结束后我会给你打电话。|call you=给你打电话/打电话给你;after=后;meeting=会议
beginner|职场沟通|Please check the date on the form.|请核对表格上的日期。|check=核对/检查;date=日期;form=表格/表
beginner|职场沟通|We need more time to finish this task.|我们需要更多时间完成这项任务。|more time=更多时间;finish=完成;task=任务
beginner|职场沟通|The printer is next to the door.|打印机在门旁边。|printer=打印机;next to=旁边/旁;door=门
beginner|职场沟通|Thank you for helping me today.|谢谢你今天帮助我。|Thank you=谢谢/感谢;helping me=帮助我/帮我;today=今天
beginner|社会科技|Please turn off the lights before you leave.|离开前请关灯。|turn off=关;lights=灯;before you leave=离开前/走之前
beginner|社会科技|Many people ride bikes to work.|许多人骑自行车上班。|Many people=许多人/很多人;ride bikes=骑自行车/骑车;to work=上班
beginner|社会科技|We should not waste clean water.|我们不应该浪费干净的水。|should not=不应该/不应;waste=浪费;clean water=干净的水/清洁的水
beginner|社会科技|The library is free for everyone.|图书馆对所有人免费开放。|library=图书馆;free=免费;everyone=所有人/每个人
beginner|社会科技|This phone has a large screen.|这部手机有一个大屏幕。|phone=手机;large=大;screen=屏幕
beginner|社会科技|Children can play safely in this park.|孩子们可以在这个公园里安全地玩耍。|Children=孩子; safely=安全;park=公园
beginner|社会科技|Our town planted more trees this year.|我们镇今年种了更多树。|Our town=我们镇/我们的镇;planted=种;this year=今年
beginner|社会科技|Please put paper in the blue bin.|请把纸放进蓝色的垃圾桶。|paper=纸;blue=蓝色;bin=垃圾桶/回收桶
beginner|社会科技|The doctor asked me to get more sleep.|医生让我多睡一会儿。|doctor=医生;asked me=让我/叫我;more sleep=多睡/增加睡眠
beginner|社会科技|We use the internet to find information.|我们用互联网查找信息。|internet=互联网/网络;find=查找/寻找;information=信息/资料
intermediate|日常生活|I have been waiting for the delivery since this morning.|我从今天早上起就一直在等快递。|have been waiting=一直在等/一直等;delivery=快递/送货;since this morning=从今天早上/从早上
intermediate|日常生活|Although the apartment is small, it gets plenty of sunlight.|虽然这套公寓很小，但阳光很充足。|Although=虽然/尽管;apartment=公寓;plenty of sunlight=阳光很充足/充足的阳光
intermediate|日常生活|Remember to take an umbrella in case it rains later.|记得带伞，以防晚些时候下雨。|Remember=记得;umbrella=伞;in case=以防/万一
intermediate|日常生活|I used to stay up late, but now I go to bed earlier.|我以前经常熬夜，但现在睡得更早了。|used to=以前/过去;stay up late=熬夜;earlier=更早
intermediate|日常生活|We will order dinner unless you feel like cooking tonight.|除非你今晚想做饭，否则我们就点晚餐。|unless=除非;order dinner=点晚餐/点饭/叫外卖;feel like cooking=想做饭/愿意做饭
intermediate|日常生活|The vegetables in this market are fresher than those in the supermarket.|这个市场的蔬菜比超市里的更新鲜。|vegetables=蔬菜;fresher=更新鲜;supermarket=超市
intermediate|日常生活|By the time I got home, everyone had already eaten.|等我到家时，大家已经吃过饭了。|got home=到家/回到家;everyone=大家/所有人;had already eaten=已经吃过/已经吃了
intermediate|日常生活|You do not have to finish everything on your plate.|你不必把盘子里的东西全部吃完。|do not have to=不必/不用;finish everything=全部吃完/全吃完;plate=盘子/盘
intermediate|日常生活|The noise upstairs kept me awake for most of the night.|楼上的噪声让我大半夜都睡不着。|noise upstairs=楼上的噪声/楼上的噪音;kept me awake=让我/使我;most of the night=大半夜/大半个晚上/一夜大半
intermediate|日常生活|If we plan our meals ahead, we can avoid buying too much food.|如果提前安排好每餐，我们就能避免买太多食物。|plan=安排/计划;ahead=提前;avoid=避免;too much food=太多食物/过多食物
intermediate|出行旅行|The flight was delayed because of heavy snow at the airport.|由于机场下大雪，航班延误了。|flight=航班;delayed=延误/推迟;heavy snow=大雪
intermediate|出行旅行|Could you tell me which platform the train to Oxford leaves from?|你能告诉我去牛津的火车从哪个站台发车吗？|which platform=哪个站台;Oxford=牛津;leaves from=发车/出发
intermediate|出行旅行|We booked the tickets online so that we would not have to queue.|我们在网上订了票，这样就不用排队了。|booked=订;online=网上/在线;not have to queue=不用排队/不必排队
intermediate|出行旅行|The hotel offers a free shuttle to the airport every hour.|酒店每小时提供一班开往机场的免费接驳车。|free shuttle=免费接驳车/免费班车;airport=机场;every hour=每小时/每个小时
intermediate|出行旅行|Please let us know in advance if your arrival time changes.|如果到达时间有变，请提前告诉我们。|arrival time=到达时间/抵达时间;changes=有变/改变/变化;in advance=提前
intermediate|出行旅行|I would rather take the train than drive through the city centre.|比起开车穿过市中心，我更愿意坐火车。|would rather=更愿意/宁愿;train=火车;city centre=市中心
intermediate|出行旅行|Our luggage had not arrived, so the airline asked us to fill in a form.|我们的行李还没到，所以航空公司让我们填写一张表格。|luggage=行李;had not arrived=还没到/尚未到达;airline=航空公司;fill in=填写
intermediate|出行旅行|This ticket allows you to change trains without paying an extra fare.|这张票允许你换乘火车，无需额外付费。|change trains=换乘火车/转乘火车;without paying=无需/不用/不必;extra fare=额外付费/额外车费/额外费用
intermediate|出行旅行|The walking tour takes about two hours and ends near the old bridge.|徒步游览大约需要两小时，终点在老桥附近。|walking tour=徒步游览/步行游览;two hours=两小时/两个小时;old bridge=老桥/旧桥
intermediate|出行旅行|Make sure your phone is charged before you set off.|出发前要确保手机已经充好电。|Make sure=确保;charged=充好电/充电;set off=出发
intermediate|学习成长|I remember the word better when I see it in a meaningful sentence.|在有意义的句子里看到这个单词时，我会记得更牢。|remember=记;better=更牢/更好/更清楚;meaningful sentence=有意义的句子/有意义的例句
intermediate|学习成长|Instead of translating every word, try to understand the main idea first.|不要逐词翻译，先试着理解大意。|Instead of=不要/而不是;every word=逐词/每个词;main idea=大意/主要意思/主旨
intermediate|学习成长|The more often you review the notes, the easier they become to remember.|你复习笔记越频繁，就越容易记住。|review the notes=复习笔记;more often=越频繁/越经常;easier=越容易
intermediate|学习成长|She asked whether we could hand in the report a day later.|她问我们能否晚一天提交报告。|asked whether=问/询问;hand in=提交/交;day later=晚一天/推迟一天
intermediate|学习成长|I could not understand the speaker until I listened a second time.|我听了第二遍才理解讲话者的意思。|could not=才/没能/不能;understand=理解/听懂;second time=第二遍/第二次
intermediate|学习成长|You are more likely to keep studying if your daily goal is realistic.|如果每日目标切合实际，你就更有可能坚持学习。|more likely=更有可能/更可能;keep studying=坚持学习/持续学习;realistic=切合实际/现实/实际
intermediate|学习成长|This exercise focuses on understanding meaning rather than memorising a fixed translation.|这道练习侧重于理解意思，而不是背诵固定译文。|focuses on=侧重/着重/注重;understanding meaning=理解意思/理解含义;rather than=而不是/而非
intermediate|学习成长|Before checking the answer, write down the parts you are unsure about.|核对答案之前，先写下你不确定的部分。|Before=之前/前;write down=写下/记下;unsure=不确定/没把握
intermediate|学习成长|The teacher encouraged us to explain our opinions with examples.|老师鼓励我们用例子来解释自己的观点。|encouraged=鼓励;opinions=观点/看法;examples=例子/实例
intermediate|学习成长|Taking a short break can help you concentrate when you return to studying.|短暂休息可以帮助你重新学习时集中注意力。|short break=短暂休息/短时间休息;concentrate=集中注意力/专注;return to studying=重新学习/回到学习
intermediate|职场沟通|Could we move the meeting to Thursday so that everyone can attend?|我们能把会议改到星期四，让所有人都能参加吗？|move the meeting=把会议改/调整会议/更改会议;Thursday=星期四/周四;everyone=所有人/大家
intermediate|职场沟通|I have attached the document you asked for to this email.|我已把你要的文件附在这封邮件里。|attached=附;document=文件/文档;email=邮件
intermediate|职场沟通|We should agree on the main priorities before assigning individual tasks.|在分配个人任务之前，我们应该先就主要优先事项达成一致。|agree=达成一致/取得共识;priorities=优先事项/重点;assigning=分配
intermediate|职场沟通|The project is running behind schedule because two key parts arrived late.|由于两个关键零件迟到，项目进度落后了。|behind schedule=进度落后/落后于计划/延期;two key parts=两个关键零件/两个重要零件;arrived late=迟到/晚到/到货延迟
intermediate|职场沟通|Please check with the customer before making any changes to the design.|对设计作任何改动之前，请先向客户确认。|customer=客户;before=之前/前;changes=改动/更改/修改
intermediate|职场沟通|If you need more time, tell me before the deadline rather than afterwards.|如果需要更多时间，请在截止时间之前告诉我，而不是之后。|more time=更多时间;before the deadline=截止时间之前/截止日期前;rather than afterwards=而不是之后/而非事后
intermediate|职场沟通|We have not made a final decision, but we are considering both options.|我们还没有作出最终决定，但正在考虑两个方案。|not made a final decision=还没有作出最终决定/尚未作出最终决定/还没做出最终决定;considering=考虑;both options=两个方案/两种方案
intermediate|职场沟通|The new system saves time by reducing the amount of information entered twice.|新系统通过减少重复录入的信息来节省时间。|saves time=节省时间;reducing=减少;entered twice=重复录入/录入两次
intermediate|职场沟通|Let me confirm that I have understood your request correctly.|让我确认一下，我是否正确理解了你的要求。|confirm=确认;correctly=正确;request=要求/需求/请求
intermediate|职场沟通|We can finish on time provided that the requirements do not change again.|只要需求不再改变，我们就能按时完成。|on time=按时;provided that=只要/前提是;do not change again=不再改变/不再变更
intermediate|社会科技|Public transport becomes more attractive when it is reliable and affordable.|当公共交通可靠且价格合理时，它会更有吸引力。|Public transport=公共交通;reliable=可靠;affordable=价格合理/负担得起/实惠
intermediate|社会科技|This app keeps your learning records on your computer rather than uploading them.|这个应用把学习记录保存在你的电脑上，而不是上传。|learning records=学习记录;on your computer=在你的电脑上/在本机;rather than uploading=而不是上传/不上传
intermediate|社会科技|A strong password is useful, but it should not be shared with other people.|强密码很有用，但不应该与别人分享。|strong password=强密码/高强度密码;useful=有用;not be shared=不应该与别人分享/不应分享/不要分享
intermediate|社会科技|The town is building wider pavements to make walking safer.|这个镇正在修建更宽的人行道，让步行更加安全。|wider pavements=更宽的人行道;walking=步行/走路;safer=更加安全/更安全
intermediate|社会科技|Reusing a bottle is usually better than throwing it away after one drink.|重复使用瓶子通常比喝一次就扔掉更好。|Reusing=重复使用/反复使用;better=更好;throwing it away=扔掉/丢掉
intermediate|社会科技|Online information should be checked against more than one trustworthy source.|网上的信息应该与不止一个可信来源交叉核对。|Online information=网上的信息/网络信息;checked=核对/查证/验证;more than one=不止一个/多个/几个;trustworthy=可信/可靠
intermediate|社会科技|The hospital has introduced an online service for booking appointments.|这家医院推出了网上预约服务。|hospital=医院;online service=网上/在线;booking appointments=预约/挂号
intermediate|社会科技|Saving energy does not always require buying expensive new equipment.|节约能源并不总是需要购买昂贵的新设备。|Saving energy=节约能源/节能;does not always require=并不总是需要/不一定需要;expensive=昂贵/很贵
intermediate|社会科技|The survey suggests that many residents would like more green spaces.|调查表明，许多居民希望有更多绿地。|survey=调查;residents=居民;more green spaces=更多绿地/更多绿色空间
intermediate|社会科技|Technology is helpful only when people understand how to use it responsibly.|只有人们懂得如何负责任地使用技术时，技术才有帮助。|only when=只有;responsibly=负责任;helpful=有帮助/有用
advanced|日常生活|Even though working from home saves commuting time, it can make it harder to separate work from personal life.|尽管在家办公节省了通勤时间，却可能让工作和个人生活更难分开。|Even though=尽管/虽然;commuting time=通勤时间;harder to separate=更难分开/更难区分/更难划分
advanced|日常生活|Had I known that the road would be closed, I would have left home much earlier.|要是早知道那条路会封闭，我就会早得多出门。|Had I known=要是早知道/如果早知道;road would be closed=路会封闭/道路封闭/路会封;much earlier=早得多/早很多
advanced|日常生活|What matters most is not how many habits you change at once, but whether you can maintain them over time.|最重要的不是一次改变多少习惯，而是能否长期坚持。|What matters most=最重要;not=不是;maintain them over time=长期坚持/长久坚持/长期保持
advanced|日常生活|The less time I spend comparing myself with others, the more attention I can give to my own progress.|我花在与别人比较上的时间越少，就越能关注自己的进步。|less time=时间越少;comparing myself with others=与别人比较/和别人比较;own progress=自己的进步
advanced|日常生活|Rather than trying to eliminate every distraction, I set aside a short period in which I focus on one task.|我没有试图消除所有干扰，而是留出一小段时间，专注于一项任务。|Rather than=没有/不再/而不是;every distraction=所有干扰;set aside=留出/腾出;one task=一项任务/一个任务
advanced|日常生活|It was not until I started keeping a spending diary that I realised how much I was paying for small purchases.|直到开始记开销日记，我才意识到零碎购物花了我多少钱。|not until=直到;spending diary=开销日记/消费日记/记账;realised=才意识到/才发现;small purchases=零碎购物/小额消费
advanced|日常生活|No matter how carefully we make plans, unexpected events may require us to adjust our priorities.|无论计划做得多周密，意外事件都可能迫使我们调整优先事项。|No matter=无论/不管;unexpected events=意外事件/突发事件;adjust our priorities=调整优先事项/调整重点
advanced|日常生活|Choosing a cheaper product is not necessarily economical if it has to be replaced much more frequently.|如果更便宜的产品需要频繁更换，选择它未必省钱。|cheaper product=更便宜的产品;not necessarily economical=未必省钱/不一定经济/未必划算;replaced=更换/替换
advanced|日常生活|I am trying to build a routine that is flexible enough to survive a busy week without being abandoned altogether.|我在尝试建立一种足够灵活的日常安排，忙碌一周也不至于彻底放弃。|routine=日常安排/日程/作息;flexible enough=足够灵活;busy week=忙碌一周/繁忙的一周;abandoned altogether=彻底放弃/完全放弃
advanced|日常生活|A conversation can become more productive when each person first restates the other person's view before responding.|如果每个人回应前先复述对方的观点，交谈可能会更有成效。|more productive=更有成效/更有效;restates=复述/重述;before responding=回应前/回答前/回应之前
advanced|出行旅行|Unless the airline confirms otherwise, passengers whose connections were cancelled should collect their luggage before leaving the terminal.|除非航空公司另行确认，转机航班被取消的旅客应在离开航站楼之前领取行李。|Unless=除非;connections were cancelled=转机航班被取消/中转航班被取消;collect their luggage=领取行李/取行李;before=之前/前
advanced|出行旅行|The route we eventually chose was longer, but it avoided the mountain pass where heavy rain had caused landslides.|我们最后选择的路线更长，但避开了因大雨发生滑坡的山口。|longer=更长;avoided=避开;mountain pass=山口;landslides=滑坡/山体滑坡
advanced|出行旅行|Visitors are advised to reserve a time slot in advance, as arriving at the entrance does not guarantee admission.|建议游客提前预约时段，因为到达入口并不保证能够入场。|reserve a time slot=预约时段/预约时间;in advance=提前;does not guarantee admission=不保证能够入场/不保证入场/不能保证入场
advanced|出行旅行|If we had checked the local timetable instead of relying on an old guidebook, we would not have missed the last ferry.|如果当时查看了当地时刻表，而不是依赖旧旅行指南，我们就不会错过末班渡船。|local timetable=当地时刻表;old guidebook=旧旅行指南/旧旅游指南;would not have missed=就不会错过/便不会错过;last ferry=末班渡船/最后一班渡船
advanced|出行旅行|Although a direct flight costs more, it may be worth considering once the time and uncertainty of a connection are taken into account.|直飞虽然更贵，但考虑到转机的时间和不确定性后，仍可能值得选择。|direct flight=直飞/直达航班;costs more=更贵/花费更多;uncertainty=不确定性;taken into account=考虑到/考虑进去
advanced|出行旅行|The village, which used to be difficult to reach by public transport, now has a regular bus service throughout the year.|这个过去乘公共交通很难到达的村庄，如今全年都有定期公交车。|used to=过去/以前;difficult to reach=很难到达/难以到达;regular bus service=定期公交车/定期公交服务;throughout the year=全年/一年四季
advanced|出行旅行|Travellers who depend entirely on mobile maps may find themselves unable to navigate when the signal disappears.|完全依赖手机地图的旅行者可能会在信号消失时无法辨认路线。|depend entirely=完全依赖;signal disappears=信号消失/没有信号;unable to navigate=无法辨认路线/无法导航/找不到路
advanced|出行旅行|Before paying a deposit, make sure you understand which cancellations qualify for a refund and which charges are non-refundable.|支付定金前，要确认哪些取消情形可以退款，以及哪些费用不能退。|deposit=定金/订金;refund=退款/退钱;non-refundable=不能退/不予退还/不可退
advanced|出行旅行|As attractive as a tightly packed itinerary may seem, leaving some unscheduled time often makes a trip less stressful.|尽管排得很满的行程看似诱人，留些自由时间通常能让旅途更轻松。|tightly packed itinerary=排得很满的行程/紧凑的行程;unscheduled time=自由时间/未安排的时间;less stressful=更轻松/压力更小
advanced|出行旅行|The guide asked us to keep our voices low so that we would not disturb the animals that lived near the path.|导游让我们放低声音，以免惊扰住在小径附近的动物。|keep our voices low=放低声音/小声;not disturb=以免惊扰/不打扰/不惊扰;near the path=小径附近/路边
advanced|学习成长|Being able to recognise a word in isolation does not necessarily mean that you can understand its meaning in an unfamiliar context.|能认出孤立的单词，并不一定意味着能理解它在陌生语境中的含义。|in isolation=孤立的/孤立地/单独;does not necessarily mean=并不一定意味着/不一定代表;unfamiliar context=陌生语境/不熟悉的语境
advanced|学习成长|The aim of reviewing a difficult sentence is not merely to remember its translation, but to notice how its meaning is constructed.|复习难句的目的不只是记住译文，还要留意句意是如何构成的。|not merely=不只是/不仅仅;translation=译文/翻译;meaning is constructed=句意是如何构成/意思如何构成/含义如何形成
advanced|学习成长|If a scoring system treats every unfamiliar expression as a mistake, it may discourage learners from experimenting with natural alternatives.|如果评分系统把每种不熟悉的表达都当作错误，就可能打击学习者尝试自然替代表达的积极性。|scoring system=评分系统;as a mistake=当作错误/视为错误;discourage=打击/阻碍/使人不愿;natural alternatives=自然替代表达/自然的替代表达
advanced|学习成长|Only after comparing my answer with the original did I notice that I had reversed the relationship between cause and effect.|直到把答案与原文比较后，我才发现自己把因果关系颠倒了。|Only after=直到/只有在;original=原文;reversed=颠倒;cause and effect=因果关系/原因和结果
advanced|学习成长|What makes a study plan sustainable is the balance between a challenging goal and a workload that can realistically be maintained.|让学习计划能够持续下去的，是有挑战性的目标与实际可坚持的学习量之间的平衡。|sustainable=能够持续/可持续/持续下去;challenging goal=有挑战性的目标;workload=学习量/任务量;balance=平衡
advanced|学习成长|Rather than assuming that one poor result reflects a lack of ability, examine which specific skills the task required.|不要认定一次差成绩就说明能力不足，而应分析这项任务具体需要哪些技能。|one poor result=一次差成绩/一次不好的结果;lack of ability=能力不足;which specific skills=哪些技能/哪些具体技能
advanced|学习成长|The feedback was useful because it identified information I had omitted, while acknowledging that my wording was different but reasonable.|这份反馈很有用，因为它指出了我遗漏的信息，同时承认我的措辞虽不同却合理。|omitted=遗漏/漏掉;acknowledging=承认/认可;different but reasonable=虽不同却合理/不同但合理
advanced|学习成长|A passage that contains only familiar words can still be difficult if the relationships between its clauses are not understood.|即使一篇文章只包含熟悉的词，如果不理解分句之间的关系，读起来仍然可能很难。|familiar words=熟悉的词/熟词;relationships=关系;clauses=分句/从句;still be difficult=仍然可能很难/依然很难
advanced|学习成长|When listening for the first time, try to grasp the overall message before focusing on words that you may have missed.|第一次听时，先尝试把握整体意思，再关注可能漏听的单词。|first time=第一次;overall message=整体意思/总体意思/大意;before=先/再;missed=漏听/没听到
advanced|学习成长|The value of a reference translation lies in offering one defensible interpretation, not in excluding every other valid way of expressing the same idea.|参考译文的价值在于提供一种站得住脚的理解，而不是排斥表达同一意思的其他合理方式。|reference translation=参考译文;one defensible interpretation=一种站得住脚的理解/一种合理理解/一种合理的理解;not in excluding=而不是排斥/不在于排除;valid way=合理方式/合理表达
advanced|职场沟通|Before committing to a deadline, we need to distinguish tasks that depend on external suppliers from those we can control ourselves.|承诺截止日期之前，我们需要区分依赖外部供应商的任务和能够自行控制的任务。|committing to a deadline=承诺截止日期/承诺期限;external suppliers=外部供应商;distinguish=区分;control ourselves=自行控制/自己控制
advanced|职场沟通|The proposal should explain not only what the new process will improve, but also how those improvements will be measured.|这份提案不仅应该说明新流程会改善什么，还应说明如何衡量这些改善。|not only=不仅;new process=新流程;measured=衡量/测量/评估
advanced|职场沟通|Even if the immediate problem can be fixed quickly, we should investigate why the existing checks failed to detect it.|即使眼前的问题能迅速修复，我们也应该调查现有检查为什么没能发现它。|Even if=即使/就算;fixed quickly=迅速修复/快速修复;investigate=调查;failed to detect=没能发现/未能发现
advanced|职场沟通|Since the requirements are still evolving, a small working version would give us more useful feedback than an elaborate unfinished design.|由于需求仍在变化，一个小而可用的版本会比复杂但未完成的设计带来更有用的反馈。|requirements=需求;small working version=小而可用的版本/小型可用版本;unfinished design=未完成的设计;more useful feedback=更有用的反馈
advanced|职场沟通|I would appreciate it if you could clarify whether this change affects existing customers or applies only to new accounts.|如果你能说明这项变更会影响现有客户，还是仅适用于新账户，我将十分感谢。|clarify=说明/澄清;existing customers=现有客户;only to new accounts=仅适用于新账户/只适用于新账户;appreciate=感谢
advanced|职场沟通|The manager emphasised that reporting a risk early was more helpful than hiding it until the final review.|经理强调，尽早报告风险比把它隐瞒到最终评审时更有帮助。|reporting a risk early=尽早报告风险/提前报告风险;hiding=隐瞒;final review=最终评审/最终审查
advanced|职场沟通|We should avoid treating a successful demonstration as evidence that the system will work reliably under everyday conditions.|我们应避免把一次成功演示当作系统在日常条件下也能可靠运行的证据。|successful demonstration=成功演示;as evidence=当作/作为/视为;reliably=可靠;everyday conditions=日常条件/日常环境
advanced|职场沟通|If the team had documented the reasons behind the earlier decision, we would not need to repeat the same discussion now.|如果团队当时记录了先前决定背后的原因，现在就不必重复同样的讨论。|documented=记录;earlier decision=先前决定/之前的决定;would not need=就不必/就不用;repeat=重复
advanced|职场沟通|What we need from this meeting is a clear decision about the next step, together with an owner and a realistic completion date.|我们需要从这次会议中得到明确的下一步决定，以及负责人和切合实际的完成日期。|next step=下一步;owner=负责人;realistic=切合实际/合理;completion date=完成日期/完成时间
advanced|职场沟通|Reducing the scope may be the responsible choice when the alternative is to deliver more features that have not been properly tested.|如果另一种选择是交付更多未经充分测试的功能，那么缩小范围可能才是负责任的选择。|Reducing the scope=缩小范围/减少范围;responsible choice=负责任的选择;not been properly tested=未经充分测试/没有经过充分测试
advanced|社会科技|A recommendation based on incomplete data should be presented as tentative rather than as a conclusion that has already been established.|依据不完整数据提出的建议，应该被视为暂定意见，而不是已经确立的结论。|incomplete data=不完整数据/不完整的数据;tentative=暂定/初步;rather than=而不是/而非;established=确立/证实
advanced|社会科技|Although automation can reduce repetitive work, people still need a clear way to review decisions and correct errors.|尽管自动化能够减少重复性工作，人们仍然需要明确的方法来审查决定和纠正错误。|automation=自动化;repetitive work=重复性工作/重复工作;review decisions=审查决定/复核决定;correct errors=纠正错误
advanced|社会科技|The fact that two events occur together does not by itself prove that one of them causes the other.|两件事同时发生这一事实，本身并不能证明其中一件导致了另一件。|occur together=同时发生;does not by itself prove=本身并不能证明/本身不能证明;causes=导致/引起
advanced|社会科技|As cities become more crowded, providing reliable public transport may matter more than simply building additional roads.|随着城市更加拥挤，提供可靠的公共交通可能比单纯增建道路更重要。|more crowded=更加拥挤/更拥挤;reliable public transport=可靠的公共交通;additional roads=增建道路/增加道路/更多道路
advanced|社会科技|A service that collects less personal information can reduce the consequences of a breach, even if no system is perfectly secure.|即使没有系统绝对安全，收集更少个人信息的服务也能减轻数据泄露的后果。|less personal information=更少个人信息/更少的个人信息;breach=数据泄露/信息泄露;even if=即使/哪怕;perfectly secure=绝对安全/完全安全
advanced|社会科技|The environmental benefit of a product depends partly on how it is made and partly on how long it remains in use.|一种产品的环境效益，一部分取决于它的制造方式，一部分取决于它能使用多久。|environmental benefit=环境效益/环保效益;how it is made=制造方式/如何制造;how long=多久/多长时间
advanced|社会科技|Without knowing how the participants were selected, it is difficult to judge whether the survey represents the wider population.|如果不知道参与者是如何选出的，就很难判断这项调查是否代表更广泛的人群。|participants were selected=参与者是如何选出/参与者如何选取;difficult to judge=很难判断/难以判断;wider population=更广泛的人群/更大的人群
advanced|社会科技|Making a tool available to everyone is only the first step; people also need the skills and support required to use it effectively.|让所有人都能获得工具只是第一步；人们还需要有效使用它所需的技能和支持。|only the first step=只是第一步/仅是第一步;skills and support=技能和支持;effectively=有效
advanced|社会科技|A useful explanation should make the limits of the evidence clear, especially when the findings may influence important personal decisions.|有用的解释应该说明证据的局限，尤其当研究结果可能影响重要个人决定时。|limits of the evidence=证据的局限/证据的限制;findings=研究结果/调查结果;personal decisions=个人决定/个人决策
advanced|社会科技|The goal of improving a digital service should be to help people complete meaningful tasks, rather than simply keeping them on the screen longer.|改进数字服务的目标，应该是帮助人们完成有意义的任务，而不只是让他们盯着屏幕更久。|digital service=数字服务;meaningful tasks=有意义的任务;rather than simply=而不只是/而不是仅仅;longer=更久/更长时间
"""


def main():
    exercises = []
    for number, row in enumerate(ROWS.strip().splitlines(), 1):
        level, topic, text, reference, groups = row.split('|')
        keywords = []
        for group in groups.split(';'):
            english, translations = group.split('=', 1)
            keywords.append({'english': english.strip(), 'translations': translations.split('/')})
        exercises.append({
            'id': f'original-practice-{number:03}',
            'text': text,
            'reference': reference,
            'keywords': keywords,
            'level': level,
            'topic': topic,
            'source': '拾句原创练习',
            'sourceUrl': '',
            'license': '项目原创',
            'attribution': '拾句项目原创英中练习；参考译文与评分关键词由本项目编写。',
            'audioSource': 'tts',
        })
    assert len(exercises) == 150
    assert Counter(item['level'] for item in exercises) == {'beginner': 50, 'intermediate': 50, 'advanced': 50}
    assert len({item['text'].casefold() for item in exercises}) == len(exercises)
    for item in exercises:
        assert 2 <= len(item['keywords']) <= 4, item['id']
        for keyword in item['keywords']:
            assert keyword['english'].casefold() in item['text'].casefold(), (item['id'], keyword['english'])
            assert all(keyword['translations']), item['id']
            assert any(word in item['reference'] for word in keyword['translations']), (item['id'], keyword)
    path = ROOT / 'data' / 'exercises.json'
    path.write_text(json.dumps(exercises, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(exercises)} exercises to {path}')


if __name__ == '__main__':
    main()
