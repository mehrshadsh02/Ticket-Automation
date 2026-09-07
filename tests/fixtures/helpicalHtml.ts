export const loginHtml = `<!doctype html>
<html lang="fa" dir="rtl"><body>
  <form action="/controller/signin.php" method="post" id="login-form">
    <input type="email" name="username" id="username" placeholder="آدرس ایمیل" required>
    <input type="password" name="password" id="password" placeholder="کلمه عبور" required>
    <button type="submit" class="btn btn-success">ورود به سیستم</button>
  </form>
</body></html>`;

export const ticketListHtml = `<!doctype html>
<html lang="fa" dir="rtl"><body><main>
  <table class="table table-striped tablesorter">
    <thead><tr>
      <th>شماره</th><th>موضوع</th><th>مرکز</th><th>سازمان</th><th>اولویت</th>
      <th>ایجاد کننده</th><th>مسئول</th><th>وضعیت</th><th>تاریخ ایجاد</th><th>آخرین بروزرسانی</th>
    </tr></thead>
    <tbody>
      <tr>
        <td>#۱۲۳۴</td><td><a href="tickets/1234/">اختلال در پذیرش</a></td>
        <td>بیمارستان اردیبهشت شیراز</td><td>گروه درمان</td><td>بالا</td>
        <td>علی رضایی</td><td>پشتیبان یک</td><td>باز</td>
        <td>۱۴۰۵/۰۶/۱۵ ۰۹:۳۰</td><td>۱۴۰۵/۰۶/۱۶ ۱۰:۴۵</td>
      </tr>
    </tbody>
  </table>
</main></body></html>`;

export const ticketDetailHtml = `<!doctype html>
<html lang="fa" dir="rtl"><body><main>
  <h2 class="ticket-title">اختلال در پذیرش</h2>
  <span id="ticket-status-des">در حال بررسی</span>
  <section id="talks">
    <article id="talks-holder" class="talks-holder gray-box">
      <h3>علی رضایی</h3>
      <div class="box-title"><time datetime="1405/06/15 09:30">۱۴۰۵/۰۶/۱۵ ۰۹:۳۰</time></div>
      <div class="message">سامانه پذیرش باز نمی‌شود.</div>
    </article>
    <article id="talks-holder" class="talks-holder success-box">
      <h3>پشتیبان یک</h3>
      <div class="box-title"><time datetime="1405/06/16 10:45">۱۴۰۵/۰۶/۱۶ ۱۰:۴۵</time></div>
      <div class="message">موضوع بررسی شد؛ لطفاً دوباره آزمایش کنید.</div>
      <span class="status">پاسخ داده شد</span>
    </article>
  </section>
</main></body></html>`;
