  $(document).ready(function () {
    const defaultTitle = $(".product-title-addon[title-count='content-count-1']").text().trim();
    $(".material-add-on-hover").text(defaultTitle);
    // $(".product-title-addon[title-count='content-count-1']").css("font-weight", "bold");
    $(".product-title-addon[title-count='content-count-1']").closest("a").addClass("active-gem-type");

    let isContentCount1Active = true;
    // $(".product-title-addon").hover(
    //   function () {
    //     let titleCount = $(this).attr("title-count");
    //     let hoverTitle = $(this).text().trim();
    //     $(".material-add-on-hover").text(hoverTitle);
    //     $(".product-title-addon").css("font-weight", "normal");
    //     $(this).css("font-weight", "bold");
    //     if (titleCount !== "content-count-1") {
    //       isContentCount1Active = false;
    //     }
    //   },
    //   function () {
    //     if (isContentCount1Active) {
    //       $(".material-add-on-hover").text(defaultTitle);
    //       $(".product-title-addon").css("font-weight", "normal");
    //       $(".product-title-addon[title-count='content-count-1']").css("font-weight", "bold");
    //     }
    //   }
    // );
    // $(".product-title-addon[title-count='content-count-1']").hover(function () {
    //   if (!isContentCount1Active) {
    //     return;
    //   }
    //   $(".material-add-on-hover").text(defaultTitle);
    //   $(".product-title-addon").css("font-weight", "normal");
    //   $(".product-title-addon[title-count='content-count-1']").css("font-weight", "bold");
    // });
  });